import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { authed } from './helpers/auth';
import { createProjectFixture, createTaskFixture, createTestUser } from './helpers/db';
import { createUserWithSession } from './helpers/scenarios';

async function taskScenario() {
  const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
  const developer = await createUserWithSession(app, { email: 'dev@example.com', globalRole: 'DEVELOPER' });
  const viewer = await createUserWithSession(app, { email: 'viewer@example.com', globalRole: 'VIEWER' });
  const outsider = await createUserWithSession(app, { email: 'outsider@example.com', globalRole: 'DEVELOPER' });
  const project = await createProjectFixture({ manager: pm.user, code: 'WEBAPP' });
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: developer.user.id, projectRole: 'DEVELOPER' },
  });
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: viewer.user.id, projectRole: 'VIEWER' },
  });
  return { pm, developer, viewer, outsider, project };
}

const TASK = { title: 'Convert monitoring portal to React' };

describe('POST /api/projects/:projectId/tasks', () => {
  it('creates tasks with per-project keys, defaults and activity', async () => {
    const { pm, project } = await taskScenario();

    const first = await authed(app, pm.client).post(`/api/projects/${project.id}/tasks`).send(TASK);
    expect(first.status).toBe(201);
    expect(first.body.data.task).toMatchObject({
      key: 'WEBAPP-1',
      number: 1,
      title: TASK.title,
      progress: 0,
      progressMode: 'MANUAL',
      version: 1,
      subtaskCount: 0,
    });
    expect(first.body.data.task.status.key).toBe('BACKLOG');
    expect(first.body.data.task.priority.key).toBe('MEDIUM');
    expect(first.body.data.task.reporter.id).toBe(pm.user.id);

    const second = await authed(app, pm.client).post(`/api/projects/${project.id}/tasks`).send({ title: 'Second task' });
    expect(second.body.data.task.key).toBe('WEBAPP-2');

    const project2 = await createProjectFixture({ manager: pm.user, code: 'OTHER' });
    const otherKey = await authed(app, pm.client).post(`/api/projects/${project2.id}/tasks`).send({ title: 'Elsewhere' });
    expect(otherKey.body.data.task.key).toBe('OTHER-1');

    expect(await prisma.activityLog.count({ where: { action: 'TASK_CREATED' } })).toBe(3);
    expect(await prisma.auditLog.count({ where: { action: 'TASK_CREATED' } })).toBe(3);
  });

  it('allocates unique keys for concurrent creates', async () => {
    const { pm, project } = await taskScenario();

    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        authed(app, pm.client)
          .post(`/api/projects/${project.id}/tasks`)
          .send({ title: `Concurrent task ${index}` }),
      ),
    );

    expect(responses.every((response) => response.status === 201)).toBe(true);
    const keys = responses.map((response) => response.body.data.task.key);
    expect(new Set(keys).size).toBe(5);
    expect(keys.sort()).toEqual(['WEBAPP-1', 'WEBAPP-2', 'WEBAPP-3', 'WEBAPP-4', 'WEBAPP-5']);
  });

  it('validates references, dates and assignees', async () => {
    const { pm, project } = await taskScenario();
    const otherProject = await createProjectFixture({ manager: pm.user, code: 'FOREIGN' });
    const foreignMilestone = await prisma.milestone.create({
      data: { projectId: otherProject.id, name: 'Foreign Milestone' },
    });
    const inactive = await createTestUser({ email: 'inactive@example.com', isActive: false });
    const stranger = await createTestUser({ email: 'stranger@example.com' });

    const shortTitle = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/tasks`)
      .send({ title: 'x' });
    expect(shortTitle.status).toBe(422);

    const badDates = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/tasks`)
      .send({ ...TASK, startDate: '2026-05-01', dueDate: '2026-01-01' });
    expect(badDates.status).toBe(422);

    const unknownStatus = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/tasks`)
      .send({ ...TASK, statusId: '11111111-1111-1111-1111-111111111111' });
    expect(unknownStatus.status).toBe(422);

    const foreignMilestoneResponse = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/tasks`)
      .send({ ...TASK, milestoneId: foreignMilestone.id });
    expect(foreignMilestoneResponse.status).toBe(404);

    const inactiveAssignee = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/tasks`)
      .send({ ...TASK, assigneeId: inactive.id });
    expect(inactiveAssignee.status).toBe(422);

    const inaccessibleAssignee = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/tasks`)
      .send({ ...TASK, assigneeId: stranger.id });
    expect(inaccessibleAssignee.status).toBe(422);

    const unknownField = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/tasks`)
      .send({ ...TASK, progressMode: 'AUTO' });
    expect(unknownField.status).toBe(422);
  });

  it('enforces task:create and project visibility', async () => {
    const { developer, viewer, outsider, project } = await taskScenario();

    const asDeveloper = await authed(app, developer.client).post(`/api/projects/${project.id}/tasks`).send(TASK);
    expect(asDeveloper.status).toBe(201);

    const asViewer = await authed(app, viewer.client).post(`/api/projects/${project.id}/tasks`).send(TASK);
    expect(asViewer.status).toBe(403);

    const asOutsider = await authed(app, outsider.client).post(`/api/projects/${project.id}/tasks`).send(TASK);
    expect(asOutsider.status).toBe(404);
  });
});

describe('GET /api/tasks/:taskId', () => {
  it('returns the task to project members and hides it from outsiders', async () => {
    const { pm, developer, outsider, project } = await taskScenario();
    const task = await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Visible task' });

    const asDeveloper = await authed(app, developer.client).get(`/api/tasks/${task.id}`);
    expect(asDeveloper.status).toBe(200);
    expect(asDeveloper.body.data.task.key).toBe(task.key);
    expect(asDeveloper.body.data.task.subtasks).toEqual([]);

    const asOutsider = await authed(app, outsider.client).get(`/api/tasks/${task.id}`);
    expect(asOutsider.status).toBe(404);

    const unknown = await authed(app, pm.client).get('/api/tasks/11111111-1111-1111-1111-111111111111');
    expect(unknown.status).toBe(404);
  });
});

describe('PATCH /api/tasks/:taskId', () => {
  it('updates fields and increments the version', async () => {
    const { pm, project } = await taskScenario();
    const created = await authed(app, pm.client).post(`/api/projects/${project.id}/tasks`).send(TASK);
    const task = created.body.data.task;

    const response = await authed(app, pm.client)
      .patch(`/api/tasks/${task.id}`)
      .send({
        version: task.version,
        title: 'Converted monitoring portal',
        description: 'Rewritten with Vite',
        estimatedHours: 12.5,
        actualHours: 3,
        nextStep: 'Wire the dashboard',
        verificationNote: 'Verified in staging',
        codeReferences: ['src/App.tsx:10-20', 'src/api/client.ts'],
        progress: 40,
      });

    expect(response.status).toBe(200);
    expect(response.body.data.task).toMatchObject({
      title: 'Converted monitoring portal',
      estimatedHours: 12.5,
      actualHours: 3,
      progress: 40,
      nextStep: 'Wire the dashboard',
      version: task.version + 1,
    });
    expect(response.body.data.task.codeReferences).toHaveLength(2);
    expect(await prisma.activityLog.count({ where: { action: 'TASK_UPDATED' } })).toBe(1);
  });

  it('rejects stale versions with 409 and leaves the task untouched', async () => {
    const { pm, project } = await taskScenario();
    const created = await authed(app, pm.client).post(`/api/projects/${project.id}/tasks`).send(TASK);
    const task = created.body.data.task;

    const updated = await authed(app, pm.client)
      .patch(`/api/tasks/${task.id}`)
      .send({ version: task.version, title: 'First writer wins' });
    expect(updated.status).toBe(200);

    const stale = await authed(app, pm.client)
      .patch(`/api/tasks/${task.id}`)
      .send({ version: task.version, title: 'Stale writer loses' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CONFLICT');

    const current = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(current.title).toBe('First writer wins');
    expect(current.version).toBe(task.version + 1);
  });

  it('replaces labels and validates them against the project', async () => {
    const { pm, project } = await taskScenario();
    const label = await prisma.label.create({ data: { projectId: project.id, name: 'Frontend' } });
    const globalLabel = await prisma.label.create({ data: { projectId: null, name: 'Global' } });
    const foreignProject = await createProjectFixture({ manager: pm.user, code: 'FOREIGN' });
    const foreignLabel = await prisma.label.create({ data: { projectId: foreignProject.id, name: 'Foreign' } });

    const created = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/tasks`)
      .send({ ...TASK, labelIds: [label.id, globalLabel.id] });
    const task = created.body.data.task;
    expect(task.labels.map((item: { name: string }) => item.name).sort()).toEqual(['Frontend', 'Global']);

    const replaced = await authed(app, pm.client)
      .patch(`/api/tasks/${task.id}`)
      .send({ version: task.version, labelIds: [label.id] });
    expect(replaced.body.data.task.labels).toHaveLength(1);

    const foreign = await authed(app, pm.client)
      .patch(`/api/tasks/${task.id}`)
      .send({ version: replaced.body.data.task.version, labelIds: [foreignLabel.id] });
    expect(foreign.status).toBe(422);
  });

  it('enforces task:update and project visibility', async () => {
    const { pm, developer, viewer, outsider, project } = await taskScenario();
    const task = await createTaskFixture({ projectId: project.id, reporter: pm.user });

    const asDeveloper = await authed(app, developer.client)
      .patch(`/api/tasks/${task.id}`)
      .send({ version: task.version, title: 'Developer edit' });
    expect(asDeveloper.status).toBe(200);

    const asViewer = await authed(app, viewer.client)
      .patch(`/api/tasks/${task.id}`)
      .send({ version: task.version, title: 'Viewer edit' });
    expect(asViewer.status).toBe(403);

    const asOutsider = await authed(app, outsider.client)
      .patch(`/api/tasks/${task.id}`)
      .send({ version: task.version, title: 'Outsider edit' });
    expect(asOutsider.status).toBe(404);
  });
});

describe('PATCH /api/tasks/:taskId/status', () => {
  it('moves a leaf task to Done with completion timestamp and 100% progress', async () => {
    const { pm, project } = await taskScenario();
    const created = await authed(app, pm.client).post(`/api/projects/${project.id}/tasks`).send(TASK);
    const task = created.body.data.task;
    const done = await prisma.taskStatus.findFirstOrThrow({ where: { key: 'DONE' } });

    const response = await authed(app, pm.client)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ statusId: done.id, version: task.version });

    expect(response.status).toBe(200);
    expect(response.body.data.task.status.key).toBe('DONE');
    expect(response.body.data.task.completedAt).not.toBeNull();
    expect(response.body.data.task.progress).toBe(100);
    expect(await prisma.activityLog.count({ where: { action: 'TASK_STATUS_CHANGED' } })).toBe(1);
  });

  it('clears the completion timestamp and lowers progress when reopened', async () => {
    const { pm, project } = await taskScenario();
    const task = await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'DONE', progress: 100 });
    const todo = await prisma.taskStatus.findFirstOrThrow({ where: { key: 'TODO' } });

    const response = await authed(app, pm.client)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ statusId: todo.id, version: task.version });

    expect(response.body.data.task.status.key).toBe('TODO');
    expect(response.body.data.task.completedAt).toBeNull();
    expect(response.body.data.task.progress).toBe(99);
  });

  it('rejects stale versions and unknown statuses', async () => {
    const { pm, project } = await taskScenario();
    const task = await createTaskFixture({ projectId: project.id, reporter: pm.user });
    const done = await prisma.taskStatus.findFirstOrThrow({ where: { key: 'DONE' } });

    const stale = await authed(app, pm.client)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ statusId: done.id, version: task.version + 5 });
    expect(stale.status).toBe(409);

    const unknown = await authed(app, pm.client)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ statusId: '11111111-1111-1111-1111-111111111111', version: task.version });
    expect(unknown.status).toBe(422);
  });

  it('requires task:update_status', async () => {
    const { pm, viewer, project } = await taskScenario();
    const task = await createTaskFixture({ projectId: project.id, reporter: pm.user });
    const todo = await prisma.taskStatus.findFirstOrThrow({ where: { key: 'TODO' } });

    const response = await authed(app, viewer.client)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ statusId: todo.id, version: task.version });
    expect(response.status).toBe(403);
  });
});

describe('PATCH /api/tasks/:taskId/assignee', () => {
  it('lets managers assign others and developers assign themselves', async () => {
    const { pm, developer, project } = await taskScenario();
    const task = await createTaskFixture({ projectId: project.id, reporter: pm.user });

    const byManager = await authed(app, pm.client)
      .patch(`/api/tasks/${task.id}/assignee`)
      .send({ assigneeId: developer.user.id, version: task.version });
    expect(byManager.status).toBe(200);
    expect(byManager.body.data.task.assignee.id).toBe(developer.user.id);

    const selfAssign = await authed(app, developer.client)
      .patch(`/api/tasks/${task.id}/assignee`)
      .send({ assigneeId: developer.user.id, version: byManager.body.data.task.version });
    expect(selfAssign.status).toBe(200);

    const unassigned = await authed(app, pm.client)
      .patch(`/api/tasks/${task.id}/assignee`)
      .send({ assigneeId: null, version: selfAssign.body.data.task.version });
    expect(unassigned.body.data.task.assignee).toBeNull();

    expect(await prisma.activityLog.count({ where: { action: 'TASK_ASSIGNED' } })).toBe(3);
  });

  it('forbids developers from assigning other people', async () => {
    const { pm, developer, project } = await taskScenario();
    const task = await createTaskFixture({ projectId: project.id, reporter: pm.user });

    const response = await authed(app, developer.client)
      .patch(`/api/tasks/${task.id}/assignee`)
      .send({ assigneeId: pm.user.id, version: task.version });
    expect(response.status).toBe(403);
  });
});

describe('DELETE /api/tasks/:taskId', () => {
  it('soft-deletes the task and its subtasks', async () => {
    const { pm, project } = await taskScenario();
    const parent = await createTaskFixture({ projectId: project.id, reporter: pm.user });
    await prisma.task.create({
      data: {
        projectId: project.id,
        number: 99,
        key: `${project.code}-99`,
        title: 'Child',
        statusId: parent.statusId,
        priorityId: parent.priorityId,
        typeId: parent.typeId,
        reporterId: pm.user.id,
        parentTaskId: parent.id,
      },
    });

    const response = await authed(app, pm.client).delete(`/api/tasks/${parent.id}`);
    expect(response.status).toBe(200);

    const rows = await prisma.task.findMany({ where: { projectId: project.id, deletedAt: null } });
    expect(rows).toHaveLength(0);
    expect(await prisma.activityLog.count({ where: { action: 'TASK_DELETED' } })).toBe(1);

    const gone = await authed(app, pm.client).get(`/api/tasks/${parent.id}`);
    expect(gone.status).toBe(404);
  });

  it('forbids developers from deleting tasks', async () => {
    const { pm, developer, project } = await taskScenario();
    const task = await createTaskFixture({ projectId: project.id, reporter: pm.user });
    const response = await authed(app, developer.client).delete(`/api/tasks/${task.id}`);
    expect(response.status).toBe(403);
  });
});

describe('task list filters', () => {
  async function filterScenario() {
    const { pm, developer, outsider, project } = await taskScenario();
    const done = await prisma.taskStatus.findFirstOrThrow({ where: { key: 'DONE' } });
    const backend = await prisma.label.create({ data: { projectId: project.id, name: 'Backend' } });
    const milestone = await prisma.milestone.create({ data: { projectId: project.id, name: 'MVP' } });

    const overdueTask = await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      title: 'Overdue critical work',
      statusKey: 'IN_PROGRESS',
      priorityKey: 'HIGH',
      assigneeId: developer.user.id,
      dueDate: '2020-01-01',
      progress: 10,
    });
    const doneTask = await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      title: 'Finished work',
      statusKey: 'DONE',
      progress: 100,
      dueDate: '2030-01-01',
    });
    const unassigned = await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      title: 'Backlog item',
      milestoneId: milestone.id,
    });
    await prisma.taskLabel.create({ data: { taskId: unassigned.id, labelId: backend.id } });
    const bug = await prisma.taskType.findFirstOrThrow({ where: { key: 'BUG' } });
    await prisma.task.update({ where: { id: doneTask.id }, data: { typeId: bug.id } });

    return { pm, developer, outsider, project, overdueTask, doneTask, unassigned, milestone, backend, done };
  }

  it('filters by status, priority, assignee, label, milestone, type and search', async () => {
    const { pm, developer, project, overdueTask, unassigned, milestone, backend } = await filterScenario();
    const base = `/api/projects/${project.id}/tasks`;

    const byStatus = await authed(app, pm.client).get(`${base}?status=IN_PROGRESS`);
    expect(byStatus.body.data.tasks).toHaveLength(1);
    expect(byStatus.body.data.tasks[0].key).toBe(overdueTask.key);

    const byPriority = await authed(app, pm.client).get(`${base}?priority=HIGH`);
    expect(byPriority.body.data.tasks).toHaveLength(1);

    const byAssignee = await authed(app, pm.client).get(`${base}?assignee=${developer.user.id}`);
    expect(byAssignee.body.data.tasks).toHaveLength(1);

    const byLabel = await authed(app, pm.client).get(`${base}?label=${backend.id}`);
    expect(byLabel.body.data.tasks).toHaveLength(1);
    expect(byLabel.body.data.tasks[0].key).toBe(unassigned.key);

    const byMilestone = await authed(app, pm.client).get(`${base}?milestone=${milestone.id}`);
    expect(byMilestone.body.data.tasks).toHaveLength(1);

    const byType = await authed(app, pm.client).get(`${base}?type=BUG`);
    expect(byType.body.data.tasks).toHaveLength(1);

    const byTitle = await authed(app, pm.client).get(`${base}?q=overdue`);
    expect(byTitle.body.data.tasks).toHaveLength(1);

    const byKey = await authed(app, pm.client).get(`${base}?q=${overdueTask.key}`);
    expect(byKey.body.data.tasks).toHaveLength(1);
    expect(byKey.body.data.tasks[0].key).toBe(overdueTask.key);
  });

  it('filters overdue, completion, progress and scopes', async () => {
    const { pm, project } = await filterScenario();
    const base = `/api/projects/${project.id}/tasks`;

    const overdue = await authed(app, pm.client).get(`${base}?overdue=true`);
    expect(overdue.body.data.tasks).toHaveLength(1);
    expect(overdue.body.data.tasks[0].isOverdue).toBe(true);

    const open = await authed(app, pm.client).get(`${base}?includeCompleted=false`);
    // The DONE task is excluded; the in-progress and backlog tasks remain.
    expect(open.body.data.tasks).toHaveLength(2);

    const unassignedScope = await authed(app, pm.client).get(`${base}?scope=unassigned`);
    expect(unassignedScope.body.data.tasks).toHaveLength(2);

    const mine = await authed(app, pm.client).get(`${base}?scope=mine`);
    expect(mine.body.data.tasks).toHaveLength(0);

    const progress = await authed(app, pm.client).get(`${base}?progressMin=90`);
    expect(progress.body.data.tasks).toHaveLength(1);
  });

  it('ages filters and sorts predictably', async () => {
    const { pm, project } = await filterScenario();
    const base = `/api/projects/${project.id}/tasks`;

    const byDueDate = await authed(app, pm.client).get(`${base}?sort=dueDate`);
    const dueDates = byDueDate.body.data.tasks.map((task: { dueDate: string | null }) => task.dueDate);
    expect(dueDates[0]).toBe('2020-01-01');

    const byPriorityDesc = await authed(app, pm.client).get(`${base}?sort=-priority`);
    expect(byPriorityDesc.body.data.tasks[0].priority.key).toBe('HIGH');

    const unknownSort = await authed(app, pm.client).get(`${base}?sort=dropTable`);
    expect(unknownSort.status).toBe(200);

    const paged = await authed(app, pm.client).get(`${base}?pageSize=2&page=2&sort=key`);
    expect(paged.body.meta).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect(paged.body.data.tasks).toHaveLength(1);
  });

  it('scopes the list to the project and hides it from outsiders', async () => {
    const { pm, outsider, project } = await filterScenario();
    const otherProject = await createProjectFixture({ manager: pm.user, code: 'OTHER' });
    await createTaskFixture({ projectId: otherProject.id, reporter: pm.user, title: 'Other project task' });

    const list = await authed(app, pm.client).get(`/api/projects/${project.id}/tasks`);
    expect(list.body.meta.total).toBe(3);

    const hidden = await authed(app, outsider.client).get(`/api/projects/${project.id}/tasks`);
    expect(hidden.status).toBe(404);
  });
});

describe('GET /api/my/tasks', () => {
  it('returns tasks assigned to the caller across accessible projects only', async () => {
    const { pm, developer, outsider, project } = await taskScenario();
    const otherProject = await createProjectFixture({ manager: pm.user, code: 'INVISIBLE' });

    await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      title: 'Mine in visible project',
      assigneeId: developer.user.id,
      statusKey: 'IN_PROGRESS',
    });
    await createTaskFixture({
      projectId: otherProject.id,
      reporter: pm.user,
      title: 'Mine but not a member',
      assigneeId: outsider.user.id,
    });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Not mine' });

    const asDeveloper = await authed(app, developer.client).get('/api/my/tasks');
    expect(asDeveloper.status).toBe(200);
    expect(asDeveloper.body.meta.total).toBe(1);
    expect(asDeveloper.body.data.tasks[0].title).toBe('Mine in visible project');
    expect(asDeveloper.body.data.tasks[0].project.code).toBe('WEBAPP');

    const withFilter = await authed(app, developer.client).get('/api/my/tasks?status=TODO');
    expect(withFilter.body.meta.total).toBe(0);

    const asOutsider = await authed(app, outsider.client).get('/api/my/tasks');
    expect(asOutsider.body.meta.total).toBe(0);
  });
});

describe('project activity includes task events', () => {
  it('records task creation in the project feed with the task key', async () => {
    const { pm, project } = await taskScenario();
    const created = await authed(app, pm.client).post(`/api/projects/${project.id}/tasks`).send(TASK);

    const feed = await authed(app, pm.client).get(`/api/projects/${project.id}/activity`);
    expect(feed.status).toBe(200);
    const entry = feed.body.data.activity.find((item: { action: string }) => item.action === 'TASK_CREATED');
    expect(entry).toBeTruthy();
    expect(entry.task.key).toBe(created.body.data.task.key);
  });
});
