import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { authed } from './helpers/auth';
import { createProjectFixture, createTaskFixture, createTestUser } from './helpers/db';
import { createUserWithSession } from './helpers/scenarios';

async function projectScenario() {
  const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
  const developer = await createUserWithSession(app, { email: 'dev@example.com', globalRole: 'DEVELOPER' });
  const outsider = await createUserWithSession(app, { email: 'outsider@example.com', globalRole: 'DEVELOPER' });
  const project = await createProjectFixture({ manager: pm.user });
  return { pm, developer, outsider, project };
}

describe('POST /api/projects/:projectId/members', () => {
  it('adds a member and records activity plus audit', async () => {
    const { pm, developer, project } = await projectScenario();

    const response = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/members`)
      .send({ userId: developer.user.id, projectRole: 'DEVELOPER' });

    expect(response.status).toBe(201);
    expect(response.body.data.member).toMatchObject({
      userId: developer.user.id,
      projectRole: 'DEVELOPER',
      isProjectManager: false,
    });

    expect(await prisma.activityLog.count({ where: { action: 'MEMBER_ADDED' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'PROJECT_MEMBER_ADDED' } })).toBe(1);
  });

  it('rejects duplicate members and inactive or unknown users', async () => {
    const { pm, developer, project } = await projectScenario();
    const inactive = await createTestUser({ email: 'inactive@example.com', isActive: false });

    await authed(app, pm.client)
      .post(`/api/projects/${project.id}/members`)
      .send({ userId: developer.user.id, projectRole: 'DEVELOPER' });

    const duplicate = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/members`)
      .send({ userId: developer.user.id, projectRole: 'VIEWER' });
    expect(duplicate.status).toBe(409);

    const inactiveResponse = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/members`)
      .send({ userId: inactive.id, projectRole: 'DEVELOPER' });
    expect(inactiveResponse.status).toBe(404);

    const unknown = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/members`)
      .send({ userId: '11111111-1111-1111-1111-111111111111', projectRole: 'DEVELOPER' });
    expect(unknown.status).toBe(404);
  });

  it('rejects invalid roles and enforces manager permissions', async () => {
    const { pm, developer, outsider, project } = await projectScenario();
    const target = await createTestUser({ email: 'target@example.com' });

    const invalidRole = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/members`)
      .send({ userId: target.id, projectRole: 'OWNER' });
    expect(invalidRole.status).toBe(422);

    await authed(app, pm.client)
      .post(`/api/projects/${project.id}/members`)
      .send({ userId: developer.user.id, projectRole: 'DEVELOPER' });

    const asDeveloper = await authed(app, developer.client)
      .post(`/api/projects/${project.id}/members`)
      .send({ userId: target.id, projectRole: 'VIEWER' });
    expect(asDeveloper.status).toBe(403);

    const asOutsider = await authed(app, outsider.client)
      .post(`/api/projects/${project.id}/members`)
      .send({ userId: target.id, projectRole: 'VIEWER' });
    expect(asOutsider.status).toBe(404);
  });
});

describe('GET /api/projects/:projectId/members', () => {
  it('lists members for anyone who can view the project and hides it from outsiders', async () => {
    const { pm, developer, outsider, project } = await projectScenario();
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: developer.user.id, projectRole: 'DEVELOPER' },
    });

    const visible = await authed(app, developer.client).get(`/api/projects/${project.id}/members`);
    expect(visible.status).toBe(200);
    expect(visible.body.data.members).toHaveLength(2);
    const manager = visible.body.data.members.find((member: { userId: string }) => member.userId === pm.user.id);
    expect(manager.isProjectManager).toBe(true);
    expect(JSON.stringify(visible.body)).not.toContain('passwordHash');

    const hidden = await authed(app, outsider.client).get(`/api/projects/${project.id}/members`);
    expect(hidden.status).toBe(404);
  });
});

describe('GET /api/projects/:projectId/members/progress', () => {
  it('returns each member task breakdown with progress and hides it from outsiders', async () => {
    const { pm, developer, outsider, project } = await projectScenario();
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: developer.user.id, projectRole: 'DEVELOPER' },
    });

    const done = await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      title: 'Shipped',
      statusKey: 'DONE',
      assigneeId: developer.user.id,
      progress: 100,
    });
    const open = await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      title: 'In flight',
      statusKey: 'IN_PROGRESS',
      assigneeId: developer.user.id,
      progress: 40,
    });

    const response = await authed(app, developer.client).get(`/api/projects/${project.id}/members/progress`);
    expect(response.status).toBe(200);

    const row = response.body.data.members.find((member: { userId: string }) => member.userId === developer.user.id);
    expect(row).toMatchObject({ assigned: 2, completed: 1, open: 1, completionPercent: 50, averageProgress: 70 });
    expect(row.tasks.map((task: { id: string }) => task.id).sort()).toEqual([done.id, open.id].sort());
    expect(row.tasks.find((task: { id: string }) => task.id === done.id).displayKey).toBe(done.key);

    const hidden = await authed(app, outsider.client).get(`/api/projects/${project.id}/members/progress`);
    expect(hidden.status).toBe(404);
  });
});

describe('PATCH /api/projects/:projectId/members/:userId', () => {
  it('updates a role and records the transition', async () => {
    const { pm, developer, project } = await projectScenario();
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: developer.user.id, projectRole: 'DEVELOPER' },
    });

    const response = await authed(app, pm.client)
      .patch(`/api/projects/${project.id}/members/${developer.user.id}`)
      .send({ projectRole: 'VIEWER' });

    expect(response.status).toBe(200);
    expect(response.body.data.member.projectRole).toBe('VIEWER');

    const activity = await prisma.activityLog.findFirst({ where: { action: 'MEMBER_ROLE_CHANGED' } });
    expect(activity!.oldValue).toBe('DEVELOPER');
    expect(activity!.newValue).toBe('VIEWER');
  });

  it('prevents changing your own role', async () => {
    const { pm, project } = await projectScenario();
    const response = await authed(app, pm.client)
      .patch(`/api/projects/${project.id}/members/${pm.user.id}`)
      .send({ projectRole: 'VIEWER' });
    expect(response.status).toBe(403);
  });

  it('protects the project manager role from non-administrators', async () => {
    const { pm, developer, project } = await projectScenario();
    const otherManager = await createTestUser({ email: 'manager2@example.com', globalRole: 'PROJECT_MANAGER' });
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: developer.user.id, projectRole: 'MANAGER' },
    });

    // A developer cannot touch the project manager's membership at all.
    const asDeveloper = await authed(app, developer.client)
      .patch(`/api/projects/${project.id}/members/${pm.user.id}`)
      .send({ projectRole: 'DEVELOPER' });
    expect(asDeveloper.status).toBe(403);

    // The project manager may re-scope another manager membership.
    const asManagerOnManager = await authed(app, pm.client)
      .patch(`/api/projects/${project.id}/members/${developer.user.id}`)
      .send({ projectRole: 'DEVELOPER' });
    expect(asManagerOnManager.status).toBe(200);

    // Only an administrator can change the project manager's own role.
    const admin = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const asAdmin = await authed(app, admin.client)
      .patch(`/api/projects/${project.id}/members/${pm.user.id}`)
      .send({ projectRole: 'DEVELOPER' });
    expect(asAdmin.status).toBe(200);

    expect(otherManager.id).toBeTruthy();
  });
});

describe('DELETE /api/projects/:projectId/members/:userId', () => {
  it('removes a member', async () => {
    const { pm, developer, project } = await projectScenario();
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: developer.user.id, projectRole: 'DEVELOPER' },
    });

    const response = await authed(app, pm.client).delete(`/api/projects/${project.id}/members/${developer.user.id}`);
    expect(response.status).toBe(200);
    expect(await prisma.projectMember.count({ where: { projectId: project.id } })).toBe(1);
    expect(await prisma.activityLog.count({ where: { action: 'MEMBER_REMOVED' } })).toBe(1);
  });

  it('prevents self-removal and removal of the project manager', async () => {
    const { pm, developer, project } = await projectScenario();
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: developer.user.id, projectRole: 'DEVELOPER' },
    });

    const self = await authed(app, pm.client).delete(`/api/projects/${project.id}/members/${pm.user.id}`);
    expect(self.status).toBe(403);

    const managerByNonAdmin = await authed(app, developer.client)
      .delete(`/api/projects/${project.id}/members/${pm.user.id}`);
    expect(managerByNonAdmin.status).toBe(403);

    const admin = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const managerByAdmin = await authed(app, admin.client)
      .delete(`/api/projects/${project.id}/members/${pm.user.id}`);
    expect(managerByAdmin.status).toBe(409);
    expect(await prisma.projectMember.count({ where: { projectId: project.id, userId: pm.user.id } })).toBe(1);
  });

  it('returns 404 for members that do not exist in the project', async () => {
    const { pm, project } = await projectScenario();
    const stranger = await createTestUser({ email: 'stranger@example.com' });

    const response = await authed(app, pm.client).delete(`/api/projects/${project.id}/members/${stranger.id}`);
    expect(response.status).toBe(404);
  });
});
