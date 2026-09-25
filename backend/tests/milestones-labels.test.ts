import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { authed } from './helpers/auth';
import { createLabelFixture, createMilestoneFixture, createProjectFixture, createTestUser } from './helpers/db';
import { createUserWithSession } from './helpers/scenarios';

async function scenario() {
  const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
  const developer = await createUserWithSession(app, { email: 'dev@example.com', globalRole: 'DEVELOPER' });
  const outsider = await createUserWithSession(app, { email: 'outsider@example.com', globalRole: 'DEVELOPER' });
  const project = await createProjectFixture({ manager: pm.user, code: 'ALPHA' });
  const otherProject = await createProjectFixture({ manager: pm.user, code: 'BRAVO' });
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: developer.user.id, projectRole: 'DEVELOPER' },
  });
  return { pm, developer, outsider, project, otherProject };
}

describe('milestones', () => {
  it('supports the full lifecycle with activity and audit entries', async () => {
    const { pm, project } = await scenario();

    const created = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/milestones`)
      .send({ name: 'MVP Release', description: 'Ship the portal', targetDate: '2026-10-15' });
    expect(created.status).toBe(201);
    expect(created.body.data.milestone).toMatchObject({ name: 'MVP Release', status: 'PLANNED', targetDate: '2026-10-15' });
    const milestoneId = created.body.data.milestone.id as string;

    const updated = await authed(app, pm.client)
      .patch(`/api/projects/${project.id}/milestones/${milestoneId}`)
      .send({ status: 'COMPLETED' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.milestone.completedAt).not.toBeNull();

    const reopened = await authed(app, pm.client)
      .patch(`/api/projects/${project.id}/milestones/${milestoneId}`)
      .send({ status: 'IN_PROGRESS' });
    expect(reopened.body.data.milestone.completedAt).toBeNull();

    const list = await authed(app, pm.client).get(`/api/projects/${project.id}/milestones`);
    expect(list.body.data.milestones).toHaveLength(1);

    const removed = await authed(app, pm.client).delete(`/api/projects/${project.id}/milestones/${milestoneId}`);
    expect(removed.status).toBe(200);
    const after = await authed(app, pm.client).get(`/api/projects/${project.id}/milestones`);
    expect(after.body.data.milestones).toHaveLength(0);

    expect(await prisma.activityLog.count({ where: { action: 'MILESTONE_CREATED' } })).toBe(1);
    expect(await prisma.activityLog.count({ where: { action: 'MILESTONE_COMPLETED' } })).toBe(1);
    expect(await prisma.activityLog.count({ where: { action: 'MILESTONE_DELETED' } })).toBe(1);
  });

  it('rejects duplicate names per project but allows them across projects', async () => {
    const { pm, project, otherProject } = await scenario();
    await authed(app, pm.client).post(`/api/projects/${project.id}/milestones`).send({ name: 'Release 1' });

    const duplicate = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/milestones`)
      .send({ name: 'release 1' });
    expect(duplicate.status).toBe(409);

    const other = await authed(app, pm.client)
      .post(`/api/projects/${otherProject.id}/milestones`)
      .send({ name: 'Release 1' });
    expect(other.status).toBe(201);
  });

  it('validates input and enforces permissions', async () => {
    const { pm, developer, outsider, project } = await scenario();

    const invalid = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/milestones`)
      .send({ name: 'x', status: 'WHATEVER' });
    expect(invalid.status).toBe(422);

    const asDeveloper = await authed(app, developer.client)
      .post(`/api/projects/${project.id}/milestones`)
      .send({ name: 'Developer Attempt' });
    expect(asDeveloper.status).toBe(403);

    const asOutsider = await authed(app, outsider.client)
      .post(`/api/projects/${project.id}/milestones`)
      .send({ name: 'Outsider Attempt' });
    expect(asOutsider.status).toBe(404);

    const canList = await authed(app, developer.client).get(`/api/projects/${project.id}/milestones`);
    expect(canList.status).toBe(200);
  });

  it('cannot be modified through a different project id', async () => {
    const { pm, project, otherProject } = await scenario();
    const foreignMilestone = await createMilestoneFixture(otherProject.id, 'Foreign Milestone');

    const update = await authed(app, pm.client)
      .patch(`/api/projects/${project.id}/milestones/${foreignMilestone.id}`)
      .send({ name: 'Hijacked' });
    expect(update.status).toBe(404);

    const remove = await authed(app, pm.client)
      .delete(`/api/projects/${project.id}/milestones/${foreignMilestone.id}`);
    expect(remove.status).toBe(404);

    const untouched = await prisma.milestone.findUniqueOrThrow({ where: { id: foreignMilestone.id } });
    expect(untouched.name).toBe('Foreign Milestone');
    expect(untouched.deletedAt).toBeNull();
  });
});

describe('labels', () => {
  it('supports CRUD, validation and duplicate detection', async () => {
    const { pm, project } = await scenario();

    const created = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/labels`)
      .send({ name: 'Frontend', color: '#6366f1' });
    expect(created.status).toBe(201);
    const labelId = created.body.data.label.id as string;

    const duplicate = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/labels`)
      .send({ name: 'frontend' });
    expect(duplicate.status).toBe(409);

    const badColor = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/labels`)
      .send({ name: 'Backend', color: 'blue' });
    expect(badColor.status).toBe(422);

    const renamed = await authed(app, pm.client)
      .patch(`/api/projects/${project.id}/labels/${labelId}`)
      .send({ name: 'Web UI', color: '#0ea5e9' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.label).toMatchObject({ name: 'Web UI', color: '#0ea5e9' });

    const removed = await authed(app, pm.client).delete(`/api/projects/${project.id}/labels/${labelId}`);
    expect(removed.status).toBe(200);
    const list = await authed(app, pm.client).get(`/api/projects/${project.id}/labels`);
    expect(list.body.data.labels).toHaveLength(0);
  });

  it('includes global labels but cannot modify them through a project route', async () => {
    const { pm, project } = await scenario();
    const globalLabel = await prisma.label.create({ data: { projectId: null, name: 'Global Tag', color: '#22c55e' } });

    const list = await authed(app, pm.client).get(`/api/projects/${project.id}/labels`);
    expect(list.body.data.labels.map((label: { name: string }) => label.name)).toContain('Global Tag');
    expect(list.body.data.labels.find((label: { name: string }) => label.name === 'Global Tag').isGlobal).toBe(true);

    const update = await authed(app, pm.client)
      .patch(`/api/projects/${project.id}/labels/${globalLabel.id}`)
      .send({ name: 'Hijacked' });
    expect(update.status).toBe(404);
  });

  it('hides labels of other projects and enforces permissions', async () => {
    const { pm, developer, outsider, project, otherProject } = await scenario();
    const foreignLabel = await createLabelFixture(otherProject.id, 'Foreign Label');

    const crossProject = await authed(app, pm.client)
      .patch(`/api/projects/${project.id}/labels/${foreignLabel.id}`)
      .send({ name: 'Hijacked' });
    expect(crossProject.status).toBe(404);

    const asDeveloper = await authed(app, developer.client)
      .post(`/api/projects/${project.id}/labels`)
      .send({ name: 'Nope' });
    expect(asDeveloper.status).toBe(403);

    const asOutsider = await authed(app, outsider.client).get(`/api/projects/${project.id}/labels`);
    expect(asOutsider.status).toBe(404);
  });
});

describe('saved views', () => {
  it('stores, lists, updates and deletes personal views', async () => {
    const { pm, project } = await scenario();
    const filters = { status: ['IN_PROGRESS'], priority: ['HIGH'] };

    const created = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/saved-views`)
      .send({ name: 'My High Priority Tasks', filters });
    expect(created.status).toBe(201);
    expect(created.body.data.savedView).toMatchObject({ name: 'My High Priority Tasks', filters });
    const viewId = created.body.data.savedView.id as string;

    const second = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/saved-views`)
      .send({ name: 'Blocked', filters: { blocked: true }, isDefault: true });
    expect(second.status).toBe(201);

    const list = await authed(app, pm.client).get(`/api/projects/${project.id}/saved-views`);
    expect(list.body.data.savedViews).toHaveLength(2);

    const updated = await authed(app, pm.client)
      .patch(`/api/projects/${project.id}/saved-views/${viewId}`)
      .send({ name: 'Renamed View', isDefault: true });
    expect(updated.status).toBe(200);
    const defaults = await prisma.savedView.findMany({ where: { projectId: project.id, isDefault: true } });
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(viewId);

    const duplicate = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/saved-views`)
      .send({ name: 'Renamed View', filters: {} });
    expect(duplicate.status).toBe(409);

    const removed = await authed(app, pm.client).delete(`/api/projects/${project.id}/saved-views/${viewId}`);
    expect(removed.status).toBe(200);
    expect(await prisma.savedView.count({ where: { projectId: project.id } })).toBe(1);
  });

  it('keeps saved views private to their owner', async () => {
    const { pm, developer, project, otherProject } = await scenario();

    const own = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/saved-views`)
      .send({ name: 'PM View', filters: {} });
    await authed(app, pm.client)
      .post(`/api/projects/${otherProject.id}/saved-views`)
      .send({ name: 'Other Project View', filters: {} });

    const developerList = await authed(app, developer.client).get(`/api/projects/${project.id}/saved-views`);
    expect(developerList.body.data.savedViews).toHaveLength(0);

    const stealDelete = await authed(app, developer.client).delete(
      `/api/projects/${project.id}/saved-views/${own.body.data.savedView.id}`,
    );
    expect(stealDelete.status).toBe(404);
    expect(await prisma.savedView.count({ where: { id: own.body.data.savedView.id } })).toBe(1);
  });

  it('requires project visibility', async () => {
    const { outsider, project } = await scenario();
    const list = await authed(app, outsider.client).get(`/api/projects/${project.id}/saved-views`);
    expect(list.status).toBe(404);

    const create = await authed(app, outsider.client)
      .post(`/api/projects/${project.id}/saved-views`)
      .send({ name: 'Nope', filters: {} });
    expect(create.status).toBe(404);
  });

  it('rejects unknown users in the saved view payload volume limit', async () => {
    const { pm, project } = await scenario();
    const hugeFilters = { note: 'x'.repeat(11_000) };
    const response = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/saved-views`)
      .send({ name: 'Too Big', filters: hugeFilters });
    expect(response.status).toBe(422);
  });
});

describe('project creation defaults', () => {
  it('falls back to the default status and priority when none are provided', async () => {
    const { client } = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const response = await authed(app, client)
      .post('/api/projects')
      .send({ code: 'DEFAULTS', name: 'Defaults Project' });

    expect(response.status).toBe(201);
    expect(response.body.data.project.status.key).toBe('PLANNING');
    expect(response.body.data.project.status.category).toBe('PLANNING');
    expect(response.body.data.project.priority.key).toBe('MEDIUM');
  });
});

describe('unused fixture sanity', () => {
  it('creates users without throwing', async () => {
    const user = await createTestUser({ email: 'sanity@example.com' });
    expect(user.id).toBeTruthy();
  });
});
