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
  const project = await createProjectFixture({ manager: pm.user, code: 'REPORT', statusKey: 'ACTIVE' });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: developer.user.id, projectRole: 'DEVELOPER' } });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: viewer.user.id, projectRole: 'VIEWER' } });
  return { pm, developer, viewer, outsider, project };
}

describe('GET /api/projects/:projectId/analytics', () => {
  it('computes completion, distributions and per-assignee workload', async () => {
    const { pm, developer, project } = await scenario();

    await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'DONE', priorityKey: 'HIGH', progress: 100, estimatedHours: 8, assigneeId: developer.user.id });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'DONE', priorityKey: 'LOW', progress: 100, estimatedHours: 4 });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'IN_PROGRESS', priorityKey: 'HIGH', progress: 40, estimatedHours: 10, assigneeId: developer.user.id });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'TODO', priorityKey: 'MEDIUM' });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'CANCELLED', progress: 0 });

    const response = await authed(app, pm.client).get(`/api/projects/${project.id}/analytics`);
    expect(response.status).toBe(200);
    const data = response.body.data;

    expect(data.project).toMatchObject({ code: 'REPORT', status: { category: 'ACTIVE' } });
    expect(data.completion).toMatchObject({ total: 5, done: 2, open: 2, cancelled: 1, donePercent: 50 });

    const statusCounts = Object.fromEntries(data.byStatus.map((row: { key: string; count: number }) => [row.key, row.count]));
    expect(statusCounts).toMatchObject({ DONE: 2, IN_PROGRESS: 1, TODO: 1, CANCELLED: 1 });

    const priorityCounts = Object.fromEntries(data.byPriority.map((row: { key: string; count: number }) => [row.key, row.count]));
    // The cancelled task was created without a priority, so it defaults to Medium.
expect(priorityCounts).toMatchObject({ HIGH: 2, LOW: 1, MEDIUM: 2 });

    expect(data.byType.length).toBeGreaterThan(0);

    const developerRow = data.byAssignee.find((row: { user: { id: string } | null }) => row.user?.id === developer.user.id);
    expect(developerRow).toMatchObject({ open: 1, done: 1, estimatedHours: 18, actualHours: 0 });

    const unassignedRow = data.byAssignee.find((row: { user: unknown }) => row.user === null);
    expect(unassignedRow).toMatchObject({ open: 1, done: 1 });
  });

  it('produces trend, burndown and velocity series', async () => {
    const { pm, project } = await scenario();
    await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'DONE', progress: 100 });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'TODO' });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'TODO' });

    const response = await authed(app, pm.client).get(`/api/projects/${project.id}/analytics?days=14`);
    const data = response.body.data;

    expect(data.windowDays).toBe(14);
    expect(data.createdTrend).toHaveLength(14);
    expect(data.completedTrend).toHaveLength(14);
    // Everything was created and completed today.
    expect(data.createdTrend.at(-1).count).toBe(3);
    expect(data.completedTrend.at(-1).count).toBe(1);

    expect(data.burndown.length).toBeGreaterThanOrEqual(7);
    expect(data.burndown[0].ideal).toBeGreaterThanOrEqual(data.burndown.at(-1).ideal);
    // The final burndown point equals the number of open, non-cancelled tasks.
    expect(data.burndown.at(-1).remaining).toBe(2);

    expect(data.velocity).toHaveLength(8);
    expect(data.velocity.at(-1).completed).toBe(1);

    expect(data.cycleTime.sampleSize).toBe(1);
    expect(data.cycleTime.averageDays).not.toBeNull();
  });

  it('counts blocked and overdue work', async () => {
    const { pm, project } = await scenario();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'BLOCKED' });
    const blocker = await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'IN_PROGRESS' });
    const waiting = await createTaskFixture({ projectId: project.id, reporter: pm.user, dueDate: yesterday });
    await authed(app, pm.client).post(`/api/tasks/${waiting.id}/dependencies`).send({ dependsOnTaskId: blocker.id });

    const response = await authed(app, pm.client).get(`/api/projects/${project.id}/analytics`);
    expect(response.body.data.completion).toMatchObject({ blocked: 2, overdue: 1 });
  });

  it('enforces report access and validates the window', async () => {
    const { pm, developer, viewer, outsider, project } = await scenario();

    expect((await authed(app, developer.client).get(`/api/projects/${project.id}/analytics`)).status).toBe(200);
    expect((await authed(app, viewer.client).get(`/api/projects/${project.id}/analytics`)).status).toBe(200);
    expect((await authed(app, outsider.client).get(`/api/projects/${project.id}/analytics`)).status).toBe(404);
    expect((await authed(app, pm.client).get(`/api/projects/${project.id}/analytics?days=2`)).status).toBe(422);
  });
});
