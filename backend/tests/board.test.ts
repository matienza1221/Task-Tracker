import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { authed } from './helpers/auth';
import { createProjectFixture, createTaskFixture } from './helpers/db';
import { createUserWithSession } from './helpers/scenarios';

async function scenario() {
  const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
  const developer = await createUserWithSession(app, { email: 'dev@example.com', globalRole: 'DEVELOPER' });
  const viewer = await createUserWithSession(app, { email: 'viewer@example.com', globalRole: 'VIEWER' });
  const outsider = await createUserWithSession(app, { email: 'outsider@example.com', globalRole: 'DEVELOPER' });
  const project = await createProjectFixture({ manager: pm.user, code: 'BOARD' });
  const otherProject = await createProjectFixture({ manager: pm.user, code: 'OTHER' });
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: developer.user.id, projectRole: 'DEVELOPER' },
  });
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: viewer.user.id, projectRole: 'VIEWER' },
  });
  return { pm, developer, viewer, outsider, project, otherProject };
}

async function statusByKey(key: string) {
  return prisma.taskStatus.findFirstOrThrow({ where: { key } });
}

describe('GET /api/projects/:projectId/board', () => {
  it('returns ordered columns with top-level tasks only', async () => {
    const { pm, project } = await scenario();
    const todo = await statusByKey('TODO');
    const first = await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'First', statusKey: 'TODO' });
    const second = await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Second', statusKey: 'TODO' });
    await prisma.task.update({ where: { id: first.id }, data: { sortOrder: 1 } });
    await prisma.task.update({ where: { id: second.id }, data: { sortOrder: 0 } });
    await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      title: 'Subtask',
      parentTaskId: first.id,
      statusKey: 'TODO',
    });

    const response = await authed(app, pm.client).get(`/api/projects/${project.id}/board`);

    expect(response.status).toBe(200);
    const columns = response.body.data.columns;
    expect(columns[0].status.key).toBe('BACKLOG');
    expect(columns.map((column: { status: { key: string } }) => column.status.key)).toEqual([
      'BACKLOG',
      'TODO',
      'IN_PROGRESS',
      'IN_REVIEW',
      'TESTING',
      'BLOCKED',
      'DONE',
    ]);

    const todoColumn = columns.find((column: { status: { id: string } }) => column.status.id === todo.id);
    expect(todoColumn.tasks.map((task: { title: string }) => task.title)).toEqual(['Second', 'First']);
    expect(response.body.data.totalTasks).toBe(2);
    expect(response.body.data.truncated).toBe(false);

    const parent = todoColumn.tasks.find((task: { id: string }) => task.id === first.id);
    expect(parent.subtaskCount).toBe(1);
    expect(parent.completedSubtaskCount).toBe(0);
  });

  it('hides cancelled columns and tasks by default and includes them on request', async () => {
    const { pm, project } = await scenario();
    await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'CANCELLED', title: 'Dropped work' });

    const hidden = await authed(app, pm.client).get(`/api/projects/${project.id}/board`);
    expect(hidden.body.data.columns.some((column: { status: { key: string } }) => column.status.key === 'CANCELLED')).toBe(false);

    const included = await authed(app, pm.client).get(`/api/projects/${project.id}/board?includeCancelled=true`);
    expect(included.body.data.columns.some((column: { status: { key: string } }) => column.status.key === 'CANCELLED')).toBe(true);
  });

  it('applies board filters', async () => {
    const { pm, developer, project } = await scenario();
    const label = await prisma.label.create({ data: { projectId: project.id, name: 'Backend' } });
    const mine = await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      title: 'Assigned work',
      assigneeId: developer.user.id,
      priorityKey: 'CRITICAL',
    });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Other work' });
    await prisma.taskLabel.create({ data: { taskId: mine.id, labelId: label.id } });

    const byAssignee = await authed(app, pm.client).get(
      `/api/projects/${project.id}/board?assignee=${developer.user.id}`,
    );
    const assigneeTasks = byAssignee.body.data.columns.flatMap((column: { tasks: unknown[] }) => column.tasks);
    expect(assigneeTasks).toHaveLength(1);

    const byPriority = await authed(app, pm.client).get(`/api/projects/${project.id}/board?priority=CRITICAL`);
    expect(byPriority.body.data.totalTasks).toBe(1);

    const byLabel = await authed(app, pm.client).get(`/api/projects/${project.id}/board?label=${label.id}`);
    expect(byLabel.body.data.totalTasks).toBe(1);

    const bySearch = await authed(app, pm.client).get(`/api/projects/${project.id}/board?q=Other`);
    expect(bySearch.body.data.totalTasks).toBe(1);

    const mineOnly = await authed(app, developer.client).get(`/api/projects/${project.id}/board?scope=mine`);
    expect(mineOnly.body.data.totalTasks).toBe(1);
  });

  it('enforces project visibility', async () => {
    const { pm, outsider, project } = await scenario();
    const response = await authed(app, outsider.client).get(`/api/projects/${project.id}/board`);
    expect(response.status).toBe(404);
    expect((await authed(app, pm.client).get('/api/projects/11111111-1111-1111-1111-111111111111/board')).status).toBe(404);
  });
});

describe('POST /api/tasks/:taskId/move', () => {
  it('reorders tasks within a column and keeps positions dense', async () => {
    const { pm, project } = await scenario();
    const created = [];
    for (const title of ['One', 'Two', 'Three']) {
      const response = await authed(app, pm.client).post(`/api/projects/${project.id}/tasks`).send({ title });
      created.push(response.body.data.task);
    }
    const todo = await statusByKey('BACKLOG');

    const moved = await authed(app, pm.client)
      .post(`/api/tasks/${created[2].id}/move`)
      .send({ statusId: todo.id, targetIndex: 0, version: created[2].version });
    expect(moved.status).toBe(200);

    const rows = await prisma.task.findMany({
      where: { projectId: project.id, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }],
      select: { id: true, sortOrder: true },
    });
    expect(rows.map((row) => row.id)).toEqual([created[2].id, created[0].id, created[1].id]);
    expect(rows.map((row) => row.sortOrder)).toEqual([0, 1, 2]);
  });

  it('moves a task across columns and applies status side effects', async () => {
    const { pm, project } = await scenario();
    const created = await authed(app, pm.client).post(`/api/projects/${project.id}/tasks`).send({ title: 'Move me' });
    const task = created.body.data.task;
    const done = await statusByKey('DONE');

    const moved = await authed(app, pm.client)
      .post(`/api/tasks/${task.id}/move`)
      .send({ statusId: done.id, targetIndex: 0, version: task.version });

    expect(moved.status).toBe(200);
    expect(moved.body.data.task.status.key).toBe('DONE');
    expect(moved.body.data.task.progress).toBe(100);
    expect(moved.body.data.task.completedAt).not.toBeNull();

    const activity = await prisma.activityLog.findFirst({ where: { taskId: task.id, action: 'TASK_STATUS_CHANGED' } });
    expect(activity!.metadata).toMatchObject({ via: 'board' });

    const projectRow = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(Number(projectRow.progress)).toBe(100);
  });

  it('rejects stale versions and unknown statuses', async () => {
    const { pm, project } = await scenario();
    const created = await authed(app, pm.client).post(`/api/projects/${project.id}/tasks`).send({ title: 'Conflict' });
    const task = created.body.data.task;
    const todo = await statusByKey('TODO');

    const stale = await authed(app, pm.client)
      .post(`/api/tasks/${task.id}/move`)
      .send({ statusId: todo.id, targetIndex: 0, version: task.version + 3 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CONFLICT');

    const unknown = await authed(app, pm.client)
      .post(`/api/tasks/${task.id}/move`)
      .send({ statusId: '11111111-1111-1111-1111-111111111111', targetIndex: 0, version: task.version });
    expect(unknown.status).toBe(422);
  });

  it('requires task:update_status and project visibility', async () => {
    const { pm, viewer, outsider, project } = await scenario();
    const created = await authed(app, pm.client).post(`/api/projects/${project.id}/tasks`).send({ title: 'Guarded' });
    const task = created.body.data.task;
    const review = await statusByKey('IN_REVIEW');

    const asViewer = await authed(app, viewer.client)
      .post(`/api/tasks/${task.id}/move`)
      .send({ statusId: review.id, targetIndex: 0, version: task.version });
    expect(asViewer.status).toBe(403);

    const asOutsider = await authed(app, outsider.client)
      .post(`/api/tasks/${task.id}/move`)
      .send({ statusId: review.id, targetIndex: 0, version: task.version });
    expect(asOutsider.status).toBe(404);

    const unchanged = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(unchanged.statusId).toBe(task.status.id);
  });

  it('clamps the target index to the column bounds', async () => {
    const { pm, project } = await scenario();
    const created = await authed(app, pm.client).post(`/api/projects/${project.id}/tasks`).send({ title: 'Clamp' });
    const task = created.body.data.task;
    const backlog = await statusByKey('BACKLOG');

    const moved = await authed(app, pm.client)
      .post(`/api/tasks/${task.id}/move`)
      .send({ statusId: backlog.id, targetIndex: 999, version: task.version });
    expect(moved.status).toBe(200);
    const row = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(row.sortOrder).toBe(0);
  });
});

describe('POST /api/tasks/bulk', () => {
  async function bulkScenario() {
    const base = await scenario();
    const a = await createTaskFixture({ projectId: base.project.id, reporter: base.pm.user, title: 'Bulk A' });
    const b = await createTaskFixture({ projectId: base.project.id, reporter: base.pm.user, title: 'Bulk B' });
    const foreign = await createTaskFixture({
      projectId: base.otherProject.id,
      reporter: base.pm.user,
      title: 'Foreign',
    });
    return { ...base, a, b, foreign };
  }

  it('sets status for many tasks at once', async () => {
    const { pm, project, a, b } = await bulkScenario();
    const done = await statusByKey('DONE');

    const response = await authed(app, pm.client)
      .post('/api/tasks/bulk')
      .send({ taskIds: [a.id, b.id], action: 'set-status', statusId: done.id });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ updated: 2, action: 'set-status' });

    const rows = await prisma.task.findMany({ where: { id: { in: [a.id, b.id] } }, include: { status: true } });
    expect(rows.every((row) => row.status.category === 'DONE' && row.progress === 100)).toBe(true);

    const projectRow = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(Number(projectRow.progress)).toBe(100);
    expect(await prisma.activityLog.count({ where: { action: 'TASK_STATUS_CHANGED', taskId: { in: [a.id, b.id] } } })).toBe(2);
  });

  it('updates priority and assignee, including unassigning', async () => {
    const { pm, developer, a, b } = await bulkScenario();
    const critical = await prisma.taskPriority.findFirstOrThrow({ where: { key: 'CRITICAL' } });

    const priorityResponse = await authed(app, pm.client)
      .post('/api/tasks/bulk')
      .send({ taskIds: [a.id, b.id], action: 'set-priority', priorityId: critical.id });
    expect(priorityResponse.status).toBe(200);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: a.id } })).priorityId).toBe(critical.id);

    const assignResponse = await authed(app, pm.client)
      .post('/api/tasks/bulk')
      .send({ taskIds: [a.id, b.id], action: 'set-assignee', assigneeId: developer.user.id });
    expect(assignResponse.status).toBe(200);
    expect((await prisma.task.findMany({ where: { id: { in: [a.id, b.id] } } })).every((row) => row.assigneeId === developer.user.id)).toBe(true);

    const unassignResponse = await authed(app, pm.client)
      .post('/api/tasks/bulk')
      .send({ taskIds: [a.id], action: 'set-assignee', assigneeId: null });
    expect(unassignResponse.status).toBe(200);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: a.id } })).assigneeId).toBeNull();
  });

  it('deletes tasks and their subtasks', async () => {
    const { pm, a, b } = await bulkScenario();
    await createTaskFixture({ projectId: a.projectId, reporter: pm.user, parentTaskId: a.id, title: 'Child of A' });

    const response = await authed(app, pm.client).post('/api/tasks/bulk').send({ taskIds: [a.id, b.id], action: 'delete' });

    expect(response.status).toBe(200);
    expect(await prisma.task.count({ where: { OR: [{ id: a.id }, { id: b.id }, { parentTaskId: a.id }], deletedAt: null } })).toBe(0);
  });

  it('is atomic: an invisible task aborts the whole request without partial updates', async () => {
    const { pm, developer, a, foreign } = await bulkScenario();
    const high = await prisma.taskPriority.findFirstOrThrow({ where: { key: 'HIGH' } });

    // The manager manages both projects, so a cross-project bulk update is allowed.
    const response = await authed(app, pm.client)
      .post('/api/tasks/bulk')
      .send({ taskIds: [a.id, foreign.id], action: 'set-priority', priorityId: high.id });
    expect(response.status).toBe(200);
    expect(response.body.data.updated).toBe(2);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: foreign.id } })).priorityId).toBe(high.id);

    // A developer of the first project cannot touch the other project's tasks …
    const devResponse = await authed(app, developer.client)
      .post('/api/tasks/bulk')
      .send({ taskIds: [foreign.id], action: 'set-priority', priorityId: (await prisma.taskPriority.findFirstOrThrow({ where: { key: 'LOW' } })).id });
    expect(devResponse.status).toBe(404);

    // … and a mixed selection must not partially update the accessible half.
    const beforeMixed = await prisma.task.findUniqueOrThrow({ where: { id: a.id } });
    const mixed = await authed(app, developer.client)
      .post('/api/tasks/bulk')
      .send({ taskIds: [a.id, foreign.id], action: 'set-priority', priorityId: (await prisma.taskPriority.findFirstOrThrow({ where: { key: 'LOW' } })).id });
    expect(mixed.status).toBe(404);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: a.id } })).priorityId).toBe(beforeMixed.priorityId);
  });

  it('enforces permissions and validation', async () => {
    const { pm, viewer, a } = await bulkScenario();
    const done = await statusByKey('DONE');

    const asViewer = await authed(app, viewer.client)
      .post('/api/tasks/bulk')
      .send({ taskIds: [a.id], action: 'set-status', statusId: done.id });
    expect(asViewer.status).toBe(403);

    const empty = await authed(app, pm.client).post('/api/tasks/bulk').send({ taskIds: [], action: 'delete' });
    expect(empty.status).toBe(422);

    const missingValue = await authed(app, pm.client)
      .post('/api/tasks/bulk')
      .send({ taskIds: [a.id], action: 'set-status' });
    expect(missingValue.status).toBe(422);

    const unknownTask = await authed(app, pm.client)
      .post('/api/tasks/bulk')
      .send({ taskIds: ['11111111-1111-1111-1111-111111111111'], action: 'delete' });
    expect(unknownTask.status).toBe(404);

    // A successful bulk operation writes one audit row summarising the batch.
    await authed(app, pm.client)
      .post('/api/tasks/bulk')
      .send({ taskIds: [a.id], action: 'set-priority', priorityId: (await prisma.taskPriority.findFirstOrThrow({ where: { key: 'LOW' } })).id });
    const audit = await prisma.auditLog.findFirst({
      where: { resourceType: 'task', metadata: { path: ['bulk'], equals: true } },
    });
    expect(audit).not.toBeNull();
  });
});

describe('GET /api/search', () => {
  it('finds accessible tasks and projects only', async () => {
    const { pm, developer, outsider, project } = await scenario();
    const visible = await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Monitoring portal conversion' });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Unrelated chore' });

    const visibleProject = await prisma.project.create({
      data: {
        code: 'SEARCHME',
        name: 'Searchable Project',
        statusId: (await prisma.projectStatus.findFirstOrThrow({ where: { key: 'ACTIVE' } })).id,
        priorityId: (await prisma.taskPriority.findFirstOrThrow({ where: { key: 'MEDIUM' } })).id,
        managerId: pm.user.id,
      },
    });

    const asPm = await authed(app, pm.client).get('/api/search?q=monitoring');
    expect(asPm.status).toBe(200);
    expect(asPm.body.data.tasks).toHaveLength(1);
    expect(asPm.body.data.tasks[0].key).toBe(visible.key);

    const byKey = await authed(app, pm.client).get(`/api/search?q=${visible.key}`);
    expect(byKey.body.data.tasks).toHaveLength(1);

    const asOutsider = await authed(app, outsider.client).get('/api/search?q=monitoring');
    expect(asOutsider.body.data.tasks).toHaveLength(0);
    expect(asOutsider.body.data.projects).toHaveLength(0);

    const projects = await authed(app, pm.client).get('/api/search?q=searchable');
    expect(projects.body.data.projects).toHaveLength(1);
    expect(projects.body.data.projects[0].id).toBe(visibleProject.id);

    // The project member finds it; a developer outside the project does not.
    const asMember = await authed(app, developer.client).get('/api/search?q=monitoring');
    expect(asMember.body.data.tasks).toHaveLength(1);
  });

  it('requires a query of at least two characters and authentication', async () => {
    const { pm } = await scenario();
    expect((await authed(app, pm.client).get('/api/search?q=a')).status).toBe(422);
    expect((await authed(app, pm.client).get('/api/search')).status).toBe(422);
  });

  it('respects the result limit', async () => {
    const { pm, project } = await scenario();
    for (let index = 0; index < 5; index += 1) {
      await createTaskFixture({ projectId: project.id, reporter: pm.user, title: `Limit task ${index}` });
    }
    const response = await authed(app, pm.client).get('/api/search?q=Limit&limit=2');
    expect(response.body.data.tasks).toHaveLength(2);
  });
});
