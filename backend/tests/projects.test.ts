import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { authed } from './helpers/auth';
import { createProjectFixture, createTestUser } from './helpers/db';
import { createUserWithSession } from './helpers/scenarios';

const PROJECT_PAYLOAD = {
  code: 'webapp',
  name: 'Web Application',
  description: 'Customer portal rewrite',
  startDate: '2026-01-01',
  targetDate: '2026-06-30',
};

describe('POST /api/projects', () => {
  it('creates a project, makes the creator the manager and member, and logs activity', async () => {
    const { user: pm, client } = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });

    const response = await authed(app, client).post('/api/projects').send(PROJECT_PAYLOAD);

    expect(response.status).toBe(201);
    expect(response.body.data.project).toMatchObject({
      code: 'WEBAPP',
      name: 'Web Application',
      myRole: 'MANAGER',
      memberCount: 1,
      progress: 0,
      isArchived: false,
      startDate: '2026-01-01',
      targetDate: '2026-06-30',
    });
    expect(response.body.data.project.manager.id).toBe(pm.id);

    const membership = await prisma.projectMember.findFirst({ where: { userId: pm.id } });
    expect(membership!.projectRole).toBe('MANAGER');

    const activity = await prisma.activityLog.findFirst({ where: { action: 'PROJECT_CREATED' } });
    expect(activity).not.toBeNull();
    const audit = await prisma.auditLog.findFirst({ where: { action: 'PROJECT_CREATED' } });
    expect(audit).not.toBeNull();
  });

  it('allows administrators and forbids developers and viewers', async () => {
    const admin = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const created = await authed(app, admin.client).post('/api/projects').send({ ...PROJECT_PAYLOAD, code: 'ADMIN1' });
    expect(created.status).toBe(201);

    for (const globalRole of ['DEVELOPER', 'VIEWER'] as const) {
      const session = await createUserWithSession(app, { email: `${globalRole.toLowerCase()}@example.com`, globalRole });
      const response = await authed(app, session.client)
        .post('/api/projects')
        .send({ ...PROJECT_PAYLOAD, code: `X${globalRole.slice(0, 4)}` });
      expect(response.status).toBe(403);
    }
  });

  it('validates the project code format and uniqueness', async () => {
    const { client } = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });

    const invalid = await authed(app, client).post('/api/projects').send({ ...PROJECT_PAYLOAD, code: '1BAD' });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.details[0].path).toBe('code');

    await authed(app, client).post('/api/projects').send(PROJECT_PAYLOAD);
    const duplicate = await authed(app, client).post('/api/projects').send({ ...PROJECT_PAYLOAD, code: 'WebApp' });
    expect(duplicate.status).toBe(409);
  });

  it('rejects a target date before the start date', async () => {
    const { client } = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const response = await authed(app, client)
      .post('/api/projects')
      .send({ ...PROJECT_PAYLOAD, startDate: '2026-06-01', targetDate: '2026-01-01' });
    expect(response.status).toBe(422);
    expect(response.body.error.details[0].path).toBe('targetDate');
  });

  it('rejects unknown status and priority ids', async () => {
    const { client } = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const unknownId = '11111111-1111-1111-1111-111111111111';

    const badStatus = await authed(app, client).post('/api/projects').send({ ...PROJECT_PAYLOAD, statusId: unknownId });
    expect(badStatus.status).toBe(422);

    const badPriority = await authed(app, client).post('/api/projects').send({ ...PROJECT_PAYLOAD, priorityId: unknownId });
    expect(badPriority.status).toBe(422);
  });

  it('assigns a different manager and adds them as a member', async () => {
    const { client } = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const other = await createTestUser({ email: 'other-pm@example.com', globalRole: 'PROJECT_MANAGER' });

    const response = await authed(app, client)
      .post('/api/projects')
      .send({ ...PROJECT_PAYLOAD, managerId: other.id });

    expect(response.status).toBe(201);
    expect(response.body.data.project.manager.id).toBe(other.id);
    const membership = await prisma.projectMember.findFirst({
      where: { projectId: response.body.data.project.id, userId: other.id },
    });
    expect(membership!.projectRole).toBe('MANAGER');
  });
});

describe('GET /api/projects', () => {
  it('scopes results to visible projects per role', async () => {
    const admin = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const developer = await createUserWithSession(app, { email: 'dev@example.com', globalRole: 'DEVELOPER' });
    const stranger = await createUserWithSession(app, { email: 'stranger@example.com', globalRole: 'DEVELOPER' });

    const p1 = await createProjectFixture({ manager: pm.user, code: 'P1', name: 'Project One' });
    const p2 = await createProjectFixture({ manager: pm.user, code: 'P2', name: 'Project Two' });
    await prisma.projectMember.create({ data: { projectId: p1.id, userId: developer.user.id, projectRole: 'DEVELOPER' } });

    const adminList = await authed(app, admin.client).get('/api/projects');
    expect(adminList.body.meta.total).toBe(2);

    const pmList = await authed(app, pm.client).get('/api/projects');
    expect(pmList.body.meta.total).toBe(2);

    const devList = await authed(app, developer.client).get('/api/projects');
    expect(devList.body.data.projects).toHaveLength(1);
    expect(devList.body.data.projects[0].code).toBe('P1');
    expect(devList.body.data.projects[0].myRole).toBe('DEVELOPER');

    const strangerList = await authed(app, stranger.client).get('/api/projects');
    expect(strangerList.body.meta.total).toBe(0);
    expect(p2.id).toBeTruthy();
  });

  it('searches and filters by status, hiding archived projects by default', async () => {
    const { user, client } = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const active = await createProjectFixture({ manager: user, code: 'ACTIVE', name: 'Active Work', statusKey: 'ACTIVE' });
    await createProjectFixture({ manager: user, code: 'PLAN', name: 'Planning Work', statusKey: 'PLANNING' });
    await prisma.project.update({ where: { id: active.id }, data: { isArchived: true, archivedAt: new Date() } });

    const visible = await authed(app, client).get('/api/projects');
    expect(visible.body.meta.total).toBe(1);
    expect(visible.body.data.projects[0].code).toBe('PLAN');

    const withArchived = await authed(app, client).get('/api/projects?includeArchived=true');
    expect(withArchived.body.meta.total).toBe(2);

    const byStatus = await authed(app, client).get('/api/projects?statusKey=ACTIVE&includeArchived=true');
    expect(byStatus.body.data.projects).toHaveLength(1);
    expect(byStatus.body.data.projects[0].code).toBe('ACTIVE');

    const bySearch = await authed(app, client).get('/api/projects?search=planning');
    expect(bySearch.body.data.projects).toHaveLength(1);
    expect(bySearch.body.data.projects[0].code).toBe('PLAN');
  });
});

describe('GET /api/projects/:projectId', () => {
  it('returns the project to members, administrators and managers only', async () => {
    const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const admin = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const member = await createUserWithSession(app, { email: 'member@example.com', globalRole: 'VIEWER' });
    const outsider = await createUserWithSession(app, { email: 'outsider@example.com', globalRole: 'DEVELOPER' });

    const project = await createProjectFixture({ manager: pm.user });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.user.id, projectRole: 'VIEWER' } });

    const asManager = await authed(app, pm.client).get(`/api/projects/${project.id}`);
    expect(asManager.status).toBe(200);
    expect(asManager.body.data.project.code).toBe(project.code);

    const asAdmin = await authed(app, admin.client).get(`/api/projects/${project.id}`);
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.data.project.myRole).toBe('ADMIN');

    const asMember = await authed(app, member.client).get(`/api/projects/${project.id}`);
    expect(asMember.status).toBe(200);
    expect(asMember.body.data.project.myRole).toBe('VIEWER');

    const invisible = await authed(app, outsider.client).get(`/api/projects/${project.id}`);
    expect(invisible.status).toBe(404);

    const unknown = await authed(app, pm.client).get('/api/projects/11111111-1111-1111-1111-111111111111');
    expect(unknown.status).toBe(404);
  });
});

describe('PATCH /api/projects/:projectId', () => {
  it('updates fields for managers and records activity', async () => {
    const { user, client } = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const project = await createProjectFixture({ manager: user });

    const response = await authed(app, client)
      .patch(`/api/projects/${project.id}`)
      .send({ name: 'Renamed Project', targetDate: '2026-12-31', progressWeighting: 'HOURS' });

    expect(response.status).toBe(200);
    expect(response.body.data.project.name).toBe('Renamed Project');
    expect(response.body.data.project.targetDate).toBe('2026-12-31');
    expect(response.body.data.project.progressWeighting).toBe('HOURS');

    const activity = await prisma.activityLog.findFirst({ where: { action: 'PROJECT_UPDATED' } });
    expect(activity).not.toBeNull();
  });

  it('stamps and clears the completion date with the status category', async () => {
    const { user, client } = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const project = await createProjectFixture({ manager: user, statusKey: 'ACTIVE' });
    const completed = await prisma.projectStatus.findFirstOrThrow({ where: { key: 'COMPLETED' } });
    const active = await prisma.projectStatus.findFirstOrThrow({ where: { key: 'ACTIVE' } });

    const done = await authed(app, client)
      .patch(`/api/projects/${project.id}`)
      .send({ statusId: completed.id });
    expect(done.status).toBe(200);
    expect(done.body.data.project.actualCompletionDate).not.toBeNull();
    expect(done.body.data.project.status.category).toBe('COMPLETED');

    const reopened = await authed(app, client).patch(`/api/projects/${project.id}`).send({ statusId: active.id });
    expect(reopened.body.data.project.actualCompletionDate).toBeNull();

    const activity = await prisma.activityLog.findFirst({ where: { action: 'PROJECT_STATUS_CHANGED' } });
    expect(activity).not.toBeNull();
  });

  it('enforces project roles and visibility', async () => {
    const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const developer = await createUserWithSession(app, { email: 'dev@example.com', globalRole: 'DEVELOPER' });
    const outsider = await createUserWithSession(app, { email: 'outsider@example.com', globalRole: 'DEVELOPER' });

    const project = await createProjectFixture({ manager: pm.user });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: developer.user.id, projectRole: 'DEVELOPER' } });

    const asDeveloper = await authed(app, developer.client).patch(`/api/projects/${project.id}`).send({ name: 'Nope' });
    expect(asDeveloper.status).toBe(403);

    const asOutsider = await authed(app, outsider.client).patch(`/api/projects/${project.id}`).send({ name: 'Nope' });
    expect(asOutsider.status).toBe(404);
  });

  it('rejects an invalid date range against existing values', async () => {
    const { user, client } = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const project = await createProjectFixture({ manager: user });
    await prisma.project.update({
      where: { id: project.id },
      data: { startDate: new Date('2026-05-01T00:00:00.000Z'), targetDate: new Date('2026-06-01T00:00:00.000Z') },
    });

    const response = await authed(app, client).patch(`/api/projects/${project.id}`).send({ targetDate: '2026-01-01' });
    expect(response.status).toBe(422);
  });
});

describe('project archive and deletion', () => {
  it('archives and restores a project', async () => {
    const { user, client } = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const project = await createProjectFixture({ manager: user });

    const archived = await authed(app, client).post(`/api/projects/${project.id}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.data.project.isArchived).toBe(true);
    expect(archived.body.data.project.archivedAt).not.toBeNull();

    const restored = await authed(app, client).post(`/api/projects/${project.id}/unarchive`);
    expect(restored.body.data.project.isArchived).toBe(false);
    expect(restored.body.data.project.archivedAt).toBeNull();

    expect(await prisma.activityLog.count({ where: { action: 'PROJECT_ARCHIVED' } })).toBe(1);
    expect(await prisma.activityLog.count({ where: { action: 'PROJECT_UNARCHIVED' } })).toBe(1);
  });

  it('lets only administrators delete (soft) and purge projects', async () => {
    const admin = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const project = await createProjectFixture({ manager: pm.user });

    const byManager = await authed(app, pm.client).delete(`/api/projects/${project.id}`);
    expect(byManager.status).toBe(403);

    const soft = await authed(app, admin.client).delete(`/api/projects/${project.id}`);
    expect(soft.status).toBe(200);
    const row = await prisma.project.findUnique({ where: { id: project.id } });
    expect(row!.deletedAt).not.toBeNull();

    const hidden = await authed(app, admin.client).get(`/api/projects/${project.id}`);
    expect(hidden.status).toBe(404);

    const purged = await authed(app, admin.client).delete(`/api/projects/${project.id}?purge=true`);
    expect(purged.status).toBe(200);
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
    expect(await prisma.projectMember.count({ where: { projectId: project.id } })).toBe(0);
  });
});

describe('GET /api/projects/:projectId/activity', () => {
  it('returns the project feed to members and hides it from outsiders', async () => {
    const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const outsider = await createUserWithSession(app, { email: 'outsider@example.com', globalRole: 'DEVELOPER' });
    const project = await createProjectFixture({ manager: pm.user });
    await prisma.activityLog.create({
      data: {
        projectId: project.id,
        actorUserId: pm.user.id,
        actorNameSnapshot: pm.user.displayName,
        action: 'PROJECT_CREATED',
      },
    });

    const visible = await authed(app, pm.client).get(`/api/projects/${project.id}/activity`);
    expect(visible.status).toBe(200);
    expect(visible.body.data.activity).toHaveLength(1);
    expect(visible.body.data.activity[0].actor.displayName).toBe(pm.user.displayName);

    const hidden = await authed(app, outsider.client).get(`/api/projects/${project.id}/activity`);
    expect(hidden.status).toBe(404);
  });
});

describe('GET /api/meta/vocabularies', () => {
  it('returns the seeded vocabularies to any authenticated user', async () => {
    const { client } = await createUserWithSession(app, { email: 'viewer@example.com', globalRole: 'VIEWER' });
    const response = await authed(app, client).get('/api/meta/vocabularies');

    expect(response.status).toBe(200);
    expect(response.body.data.projectStatuses).toHaveLength(5);
    expect(response.body.data.taskStatuses).toHaveLength(8);
    expect(response.body.data.taskPriorities).toHaveLength(4);
    expect(response.body.data.taskTypes).toHaveLength(8);
    expect(response.body.data.taskStatuses[0]).toHaveProperty('category');
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/meta/vocabularies');
    expect(response.status).toBe(401);
  });
});
