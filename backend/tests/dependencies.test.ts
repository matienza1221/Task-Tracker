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
  const outsider = await createUserWithSession(app, { email: 'outsider@example.com', globalRole: 'PROJECT_MANAGER' });
  const project = await createProjectFixture({ manager: pm.user, code: 'DEPS' });
  const otherProject = await createProjectFixture({ manager: pm.user, code: 'OTHER' });
  const foreignProject = await createProjectFixture({ manager: outsider.user, code: 'FOREIGN' });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: developer.user.id, projectRole: 'DEVELOPER' } });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: viewer.user.id, projectRole: 'VIEWER' } });
  return { pm, developer, viewer, outsider, project, otherProject, foreignProject };
}

describe('task dependencies', () => {
  it('adds, lists and removes a dependency', async () => {
    const { pm, developer, project } = await scenario();
    const blocker = await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Design API' });
    const blocked = await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Build client' });

    const created = await authed(app, developer.client)
      .post(`/api/tasks/${blocked.id}/dependencies`)
      .send({ dependsOnTaskId: blocker.id });
    expect(created.status).toBe(201);
    expect(created.body.data.blockedBy).toHaveLength(1);
    expect(created.body.data.blockedBy[0].key).toBe(blocker.key);

    const list = await authed(app, developer.client).get(`/api/tasks/${blocked.id}/dependencies`);
    expect(list.status).toBe(200);
    expect(list.body.data.blockedBy.map((item: { id: string }) => item.id)).toEqual([blocker.id]);
    expect(list.body.data.blocks).toEqual([]);

    const reverse = await authed(app, developer.client).get(`/api/tasks/${blocker.id}/dependencies`);
    expect(reverse.body.data.blocks.map((item: { id: string }) => item.id)).toEqual([blocked.id]);

    expect(await prisma.activityLog.count({ where: { action: 'DEPENDENCY_ADDED' } })).toBe(1);

    const removed = await authed(app, developer.client).delete(`/api/tasks/${blocked.id}/dependencies/${blocker.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.blockedBy).toEqual([]);
    expect(await prisma.activityLog.count({ where: { action: 'DEPENDENCY_REMOVED' } })).toBe(1);
  });

  it('rejects self-dependencies and duplicates', async () => {
    const { pm, project } = await scenario();
    const task = await createTaskFixture({ projectId: project.id, reporter: pm.user });
    const other = await createTaskFixture({ projectId: project.id, reporter: pm.user });

    const self = await authed(app, pm.client).post(`/api/tasks/${task.id}/dependencies`).send({ dependsOnTaskId: task.id });
    expect(self.status).toBe(422);
    expect(self.body.error.message).toContain('cannot depend on itself');

    await authed(app, pm.client).post(`/api/tasks/${task.id}/dependencies`).send({ dependsOnTaskId: other.id });
    const duplicate = await authed(app, pm.client)
      .post(`/api/tasks/${task.id}/dependencies`)
      .send({ dependsOnTaskId: other.id });
    expect(duplicate.status).toBe(409);
  });

  it('rejects direct and transitive cycles', async () => {
    const { pm, project } = await scenario();
    const a = await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'A' });
    const b = await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'B' });
    const c = await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'C' });

    // A depends on B
    expect((await authed(app, pm.client).post(`/api/tasks/${a.id}/dependencies`).send({ dependsOnTaskId: b.id })).status).toBe(201);
    // B depends on A → cycle
    const direct = await authed(app, pm.client).post(`/api/tasks/${b.id}/dependencies`).send({ dependsOnTaskId: a.id });
    expect(direct.status).toBe(422);
    expect(direct.body.error.message).toContain('circular');

    // A → B → C, then C → A is still a cycle
    expect((await authed(app, pm.client).post(`/api/tasks/${b.id}/dependencies`).send({ dependsOnTaskId: c.id })).status).toBe(201);
    const transitive = await authed(app, pm.client).post(`/api/tasks/${c.id}/dependencies`).send({ dependsOnTaskId: a.id });
    expect(transitive.status).toBe(422);

    const rows = await prisma.taskDependency.count();
    expect(rows).toBe(2);
  });

  it('allows cross-project dependencies only when both projects are accessible', async () => {
    const { pm, developer, outsider, project, otherProject, foreignProject } = await scenario();
    const local = await createTaskFixture({ projectId: project.id, reporter: pm.user });
    const other = await createTaskFixture({ projectId: otherProject.id, reporter: pm.user });
    const foreign = await createTaskFixture({ projectId: foreignProject.id, reporter: outsider.user });

    // The manager runs both projects → allowed.
    const crossProject = await authed(app, pm.client)
      .post(`/api/tasks/${local.id}/dependencies`)
      .send({ dependsOnTaskId: other.id });
    expect(crossProject.status).toBe(201);

    // A project member cannot reach into a project they cannot see.
    const foreignAttempt = await authed(app, developer.client)
      .post(`/api/tasks/${local.id}/dependencies`)
      .send({ dependsOnTaskId: foreign.id });
    expect(foreignAttempt.status).toBe(404);

    // … and cannot reach tasks in a project they cannot see at all.
    const invisible = await authed(app, developer.client)
      .post(`/api/tasks/${foreign.id}/dependencies`)
      .send({ dependsOnTaskId: local.id });
    expect(invisible.status).toBe(404);
  });

  it('enforces task:manage_dependencies and project visibility', async () => {
    const { pm, viewer, outsider, project } = await scenario();
    const task = await createTaskFixture({ projectId: project.id, reporter: pm.user });
    const blocker = await createTaskFixture({ projectId: project.id, reporter: pm.user });

    const asViewer = await authed(app, viewer.client)
      .post(`/api/tasks/${task.id}/dependencies`)
      .send({ dependsOnTaskId: blocker.id });
    expect(asViewer.status).toBe(403);

    const asOutsider = await authed(app, outsider.client)
      .post(`/api/tasks/${task.id}/dependencies`)
      .send({ dependsOnTaskId: blocker.id });
    expect(asOutsider.status).toBe(404);

    expect(await prisma.taskDependency.count()).toBe(0);
  });

  it('reports blocked state on tasks, boards and filtered lists', async () => {
    const { pm, project } = await scenario();
    const blocker = await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Blocker', statusKey: 'IN_PROGRESS' });
    const blocked = await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Blocked work' });
    const done = await prisma.taskStatus.findFirstOrThrow({ where: { key: 'DONE' } });

    await authed(app, pm.client).post(`/api/tasks/${blocked.id}/dependencies`).send({ dependsOnTaskId: blocker.id });

    let detail = await authed(app, pm.client).get(`/api/tasks/${blocked.id}`);
    expect(detail.body.data.task.isBlocked).toBe(true);
    expect(detail.body.data.task.blockedBy[0].key).toBe(blocker.key);
    expect(detail.body.data.task.blockedBy[0].status.category).toBe('IN_PROGRESS');

    const board = await authed(app, pm.client).get(`/api/projects/${project.id}/board`);
    const boardTask = board.body.data.columns.flatMap((column: { tasks: unknown[] }) => column.tasks).find((item: { id: string }) => item.id === blocked.id);
    expect(boardTask.isBlocked).toBe(true);

    const blockedFilter = await authed(app, pm.client).get(`/api/projects/${project.id}/tasks?blocked=true`);
    expect(blockedFilter.body.data.tasks).toHaveLength(1);
    expect(blockedFilter.body.data.tasks[0].id).toBe(blocked.id);

    // Completing the blocker clears the blocked state everywhere.
    await authed(app, pm.client)
      .patch(`/api/tasks/${blocker.id}/status`)
      .send({ statusId: done.id, version: blocker.version });

    detail = await authed(app, pm.client).get(`/api/tasks/${blocked.id}`);
    expect(detail.body.data.task.isBlocked).toBe(false);

    const stillBlockedFilter = await authed(app, pm.client).get(`/api/projects/${project.id}/tasks?blocked=true`);
    expect(stillBlockedFilter.body.data.tasks).toHaveLength(0);
  });

  it('treats cancelled blockers as resolved and cascades task deletion', async () => {
    const { pm, project } = await scenario();
    const blocker = await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'CANCELLED' });
    const blocked = await createTaskFixture({ projectId: project.id, reporter: pm.user });

    await authed(app, pm.client).post(`/api/tasks/${blocked.id}/dependencies`).send({ dependsOnTaskId: blocker.id });
    const detail = await authed(app, pm.client).get(`/api/tasks/${blocked.id}`);
    expect(detail.body.data.task.isBlocked).toBe(false);

    await authed(app, pm.client).delete(`/api/tasks/${blocker.id}`);
    expect(await prisma.taskDependency.count()).toBe(0);
  });

  it('returns 404 for unknown dependencies and missing tasks', async () => {
    const { pm, project } = await scenario();
    const task = await createTaskFixture({ projectId: project.id, reporter: pm.user });

    const unknownDependency = await authed(app, pm.client)
      .post(`/api/tasks/${task.id}/dependencies`)
      .send({ dependsOnTaskId: '11111111-1111-1111-1111-111111111111' });
    expect(unknownDependency.status).toBe(404);

    const unknownTask = await authed(app, pm.client)
      .get('/api/tasks/11111111-1111-1111-1111-111111111111/dependencies');
    expect(unknownTask.status).toBe(404);

    const missingRow = await authed(app, pm.client).delete(
      `/api/tasks/${task.id}/dependencies/11111111-1111-1111-1111-111111111111`,
    );
    expect(missingRow.status).toBe(404);
  });
});
