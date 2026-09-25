import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { authed } from './helpers/auth';
import { recalculateProjectProgress } from '../src/lib/progress';
import { createProjectFixture, createTaskFixture } from './helpers/db';
import { createUserWithSession } from './helpers/scenarios';

async function scenario() {
  const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
  const developer = await createUserWithSession(app, { email: 'dev@example.com', globalRole: 'DEVELOPER' });
  const project = await createProjectFixture({ manager: pm.user, code: 'WEBAPP' });
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: developer.user.id, projectRole: 'DEVELOPER' },
  });
  return { pm, developer, project };
}

async function statusId(key: string): Promise<string> {
  const status = await prisma.taskStatus.findFirstOrThrow({ where: { key } });
  return status.id;
}

describe('subtasks', () => {
  it('creates subtasks with display keys and parent summaries', async () => {
    const { pm, project } = await scenario();
    const parent = await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Convert portal' });

    const first = await authed(app, pm.client).post(`/api/tasks/${parent.id}/subtasks`).send({ title: 'Setup Vite' });
    expect(first.status).toBe(201);
    expect(first.body.data.task.key).toBe('WEBAPP-2');
    expect(first.body.data.task.displayKey).toBe('WEBAPP-1-1');
    expect(first.body.data.task.parent.key).toBe(parent.key);

    const second = await authed(app, pm.client).post(`/api/tasks/${parent.id}/subtasks`).send({ title: 'Convert auth' });
    expect(second.body.data.task.displayKey).toBe('WEBAPP-1-2');

    const detail = await authed(app, pm.client).get(`/api/tasks/${parent.id}`);
    expect(detail.body.data.task.subtaskCount).toBe(2);
    expect(detail.body.data.task.completedSubtaskCount).toBe(0);
    expect(detail.body.data.task.progressMode).toBe('AUTO');
    expect(detail.body.data.task.subtasks.map((task: { displayKey: string }) => task.displayKey)).toEqual([
      'WEBAPP-1-1',
      'WEBAPP-1-2',
    ]);
  });

  it('drives parent progress from subtask completion', async () => {
    const { pm, project } = await scenario();
    const parent = await createTaskFixture({ projectId: project.id, reporter: pm.user });
    const a = await createTaskFixture({ projectId: project.id, reporter: pm.user, parentTaskId: parent.id });
    const b = await createTaskFixture({ projectId: project.id, reporter: pm.user, parentTaskId: parent.id });
    const doneId = await statusId('DONE');

    await authed(app, pm.client).patch(`/api/tasks/${a.id}/status`).send({ statusId: doneId, version: a.version });
    let detail = await authed(app, pm.client).get(`/api/tasks/${parent.id}`);
    expect(detail.body.data.task.progress).toBe(50);
    expect(detail.body.data.task.completedSubtaskCount).toBe(1);

    const refreshedB = await prisma.task.findUniqueOrThrow({ where: { id: b.id } });
    await authed(app, pm.client)
      .patch(`/api/tasks/${b.id}/status`)
      .send({ statusId: doneId, version: refreshedB.version });

    detail = await authed(app, pm.client).get(`/api/tasks/${parent.id}`);
    expect(detail.body.data.task.progress).toBe(100);
  });

  it('excludes cancelled subtasks from the parent denominator', async () => {
    const { pm, project } = await scenario();
    const parent = await createTaskFixture({ projectId: project.id, reporter: pm.user });
    const a = await createTaskFixture({ projectId: project.id, reporter: pm.user, parentTaskId: parent.id });
    const cancelled = await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      parentTaskId: parent.id,
      statusKey: 'CANCELLED',
    });

    const doneId = await statusId('DONE');
    await authed(app, pm.client).patch(`/api/tasks/${a.id}/status`).send({ statusId: doneId, version: a.version });

    const detail = await authed(app, pm.client).get(`/api/tasks/${parent.id}`);
    expect(detail.body.data.task.subtaskCount).toBe(1);
    expect(detail.body.data.task.progress).toBe(100);
    const cancelledRow = await prisma.task.findUniqueOrThrow({
      where: { id: cancelled.id },
      include: { status: true },
    });
    expect(cancelledRow.status.category).toBe('CANCELLED');
  });

  it('rejects deeper nesting and refuses manual progress on parents', async () => {
    const { pm, project } = await scenario();
    const parent = await createTaskFixture({ projectId: project.id, reporter: pm.user });
    const child = await createTaskFixture({ projectId: project.id, reporter: pm.user, parentTaskId: parent.id });

    const grandchild = await authed(app, pm.client).post(`/api/tasks/${child.id}/subtasks`).send({ title: 'Too deep' });
    expect(grandchild.status).toBe(422);
    expect(grandchild.body.error.code).toBe('VALIDATION_ERROR');

    const manualProgress = await authed(app, pm.client)
      .patch(`/api/tasks/${parent.id}`)
      .send({ version: parent.version, progress: 30 });
    expect(manualProgress.status).toBe(422);

    const parentDetail = await authed(app, pm.client).get(`/api/tasks/${parent.id}`);
    expect(parentDetail.body.data.task.subtaskCount).toBe(1);
    expect(parentDetail.body.data.task.subtaskCount).toBe(1);
  });

  it('inherits context from the parent and starts completed parents\u2019 subtasks in To Do', async () => {
    const { pm, project } = await scenario();
    const milestone = await prisma.milestone.create({ data: { projectId: project.id, name: 'MVP' } });
    const parent = await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'DONE', milestoneId: milestone.id, priorityKey: 'HIGH' });

    const created = await authed(app, pm.client).post(`/api/tasks/${parent.id}/subtasks`).send({ title: 'Follow-up work' });
    expect(created.status).toBe(201);
    expect(created.body.data.task.priority.key).toBe('HIGH');
    expect(created.body.data.task.milestone.id).toBe(milestone.id);
    expect(created.body.data.task.status.key).toBe('TODO');
  });

  it('enforces project visibility for subtask creation', async () => {
    const { pm, project } = await scenario();
    const outsider = await createUserWithSession(app, { email: 'outsider@example.com', globalRole: 'DEVELOPER' });
    const parent = await createTaskFixture({ projectId: project.id, reporter: pm.user });

    const response = await authed(app, outsider.client).post(`/api/tasks/${parent.id}/subtasks`).send({ title: 'Nope' });
    expect(response.status).toBe(404);
  });
});

describe('project progress engine', () => {
  it('averages top-level task progress and excludes cancelled tasks', async () => {
    const { pm, project } = await scenario();
    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Done', statusKey: 'DONE', progress: 100 });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Not started' });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Cancelled', statusKey: 'CANCELLED', progress: 0 });

    // Fixtures write directly to the database, so the engine is invoked explicitly.
    await recalculateProjectProgress(project.id);
    const refreshed = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    // 100 + 0 over two non-cancelled tasks; the cancelled row is ignored.
    expect(Number(refreshed.progress)).toBe(50);
  });

  it('supports estimated-hour weighting', async () => {
    const { pm, project } = await scenario();
    await prisma.project.update({ where: { id: project.id }, data: { progressWeighting: 'HOURS' } });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Large', progress: 100, estimatedHours: 10 });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Small', progress: 0, estimatedHours: 30 });

    await recalculateProjectProgress(project.id);
    const refreshed = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(Number(refreshed.progress)).toBe(25);
  });

  it('recomputes the project when tasks are created, updated, moved and deleted', async () => {
    const { pm, project } = await scenario();
    const created = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/tasks`)
      .send({ title: 'Tracked work' });
    const task = created.body.data.task;

    const afterCreate = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(Number(afterCreate.progress)).toBe(0);

    const updated = await authed(app, pm.client)
      .patch(`/api/tasks/${task.id}`)
      .send({ version: task.version, progress: 60 });
    expect(updated.status).toBe(200);
    const afterUpdate = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(Number(afterUpdate.progress)).toBe(60);

    const doneId = await statusId('DONE');
    await authed(app, pm.client)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ statusId: doneId, version: updated.body.data.task.version });
    const afterStatus = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(Number(afterStatus.progress)).toBe(100);

    await authed(app, pm.client).delete(`/api/tasks/${task.id}`);
    const afterDelete = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(Number(afterDelete.progress)).toBe(0);
  });

  it('keeps parent and subtask progress consistent when a subtask moves', async () => {
    const { pm, project } = await scenario();
    const parent = await createTaskFixture({ projectId: project.id, reporter: pm.user });
    const child = await createTaskFixture({ projectId: project.id, reporter: pm.user, parentTaskId: parent.id });

    const doneId = await statusId('DONE');
    await authed(app, pm.client).patch(`/api/tasks/${child.id}/status`).send({ statusId: doneId, version: child.version });

    const [parentRow, childRow, projectRow] = await Promise.all([
      prisma.task.findUniqueOrThrow({ where: { id: parent.id } }),
      prisma.task.findUniqueOrThrow({ where: { id: child.id } }),
      prisma.project.findUniqueOrThrow({ where: { id: project.id } }),
    ]);
    expect(parentRow.progress).toBe(100);
    expect(parentRow.progressMode).toBe('AUTO');
    expect(childRow.progress).toBe(100);
    expect(Number(projectRow.progress)).toBe(100);
  });

  it('preserves manual progress written directly to leaf tasks', async () => {
    const { pm, project, developer } = await scenario();
    const task = await createTaskFixture({ projectId: project.id, reporter: pm.user });

    const response = await authed(app, pm.client)
      .patch(`/api/tasks/${task.id}`)
      .send({ version: task.version, progress: 65, assigneeId: developer.user.id });

    expect(response.body.data.task.progress).toBe(65);
    expect(response.body.data.task.progressMode).toBe('MANUAL');
    expect(response.body.data.task.assignee.id).toBe(developer.user.id);
    expect(response.body.data.task.progress).toBe(65);
    expect(developer.user.id).toBeTruthy();
  });
});
