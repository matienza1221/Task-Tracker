import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { authed } from './helpers/auth';
import { createProjectFixture, createTaskFixture } from './helpers/db';
import { createUserWithSession } from './helpers/scenarios';

function daysFromToday(days: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

describe('GET /api/team/workload', () => {
  it('summarises per-developer load with hours and overdue counts', async () => {
    const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const busy = await createUserWithSession(app, { email: 'busy@example.com', globalRole: 'DEVELOPER' });
    const idle = await createUserWithSession(app, { email: 'idle@example.com', globalRole: 'DEVELOPER' });
    const project = await createProjectFixture({ manager: pm.user, code: 'LOAD' });
    for (const member of [busy, idle]) {
      await prisma.projectMember.create({ data: { projectId: project.id, userId: member.user.id, projectRole: 'DEVELOPER' } });
    }

    await createTaskFixture({ projectId: project.id, reporter: pm.user, assigneeId: busy.user.id, statusKey: 'IN_PROGRESS', estimatedHours: 10, actualHours: 4 });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, assigneeId: busy.user.id, statusKey: 'BLOCKED', estimatedHours: 5 });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, assigneeId: busy.user.id, dueDate: daysFromToday(-2), estimatedHours: 3 });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, assigneeId: busy.user.id, statusKey: 'DONE', estimatedHours: 8 });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, assigneeId: idle.user.id, statusKey: 'TODO', estimatedHours: 2 });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Nobody owns this' });

    const response = await authed(app, pm.client).get('/api/team/workload');
    expect(response.status).toBe(200);

    const busyRow = response.body.data.rows.find((row: { user: { id: string } }) => row.user.id === busy.user.id);
    expect(busyRow).toMatchObject({
      activeTasks: 3,
      inProgressTasks: 1,
      blockedTasks: 1,
      overdueTasks: 1,
      completedTasks: 1,
      estimatedHours: 18,
      actualHours: 4,
    });
    expect(busyRow.loadLevel).toMatch(/low|medium|high/);

    const idleRow = response.body.data.rows.find((row: { user: { id: string } }) => row.user.id === idle.user.id);
    expect(idleRow.activeTasks).toBe(1);
    expect(idleRow.overdueTasks).toBe(0);

    // The heaviest load sorts first.
    expect(response.body.data.rows[0].user.id).toBe(busy.user.id);

    expect(response.body.data.unassigned).toMatchObject({ activeTasks: 1 });
    expect(response.body.data.totals).toMatchObject({ activeTasks: 4, overdueTasks: 1, completedTasks: 1, estimatedHours: 20 });
  });

  it('scopes workload to accessible projects and supports a project filter', async () => {
    const alice = await createUserWithSession(app, { email: 'alice@example.com', globalRole: 'PROJECT_MANAGER' });
    const bob = await createUserWithSession(app, { email: 'bob@example.com', globalRole: 'PROJECT_MANAGER' });
    const aliceProject = await createProjectFixture({ manager: alice.user, code: 'AWORK' });
    const bobProject = await createProjectFixture({ manager: bob.user, code: 'BWORK' });

    await createTaskFixture({ projectId: aliceProject.id, reporter: alice.user, assigneeId: alice.user.id, statusKey: 'TODO' });
    await createTaskFixture({ projectId: bobProject.id, reporter: bob.user, assigneeId: bob.user.id, statusKey: 'TODO' });

    const aliceView = await authed(app, alice.client).get('/api/team/workload');
    expect(aliceView.body.data.rows).toHaveLength(1);
    expect(aliceView.body.data.rows[0].user.id).toBe(alice.user.id);

    const filtered = await authed(app, alice.client).get(`/api/team/workload?projectId=${aliceProject.id}`);
    expect(filtered.body.data.projectId).toBe(aliceProject.id);
    expect(filtered.body.data.rows).toHaveLength(1);

    const foreignFilter = await authed(app, alice.client).get(`/api/team/workload?projectId=${bobProject.id}`);
    expect(foreignFilter.status).toBe(404);
  });

  it('is available to viewers and requires authentication', async () => {
    const { default: request } = await import('supertest');
    const viewer = await createUserWithSession(app, { email: 'viewer@example.com', globalRole: 'VIEWER' });
    const project = await createProjectFixture({ manager: viewer.user, code: 'VIEWONLY' });
    void project;

    expect((await authed(app, viewer.client).get('/api/team/workload')).status).toBe(200);
    expect((await request(app).get('/api/team/workload')).status).toBe(401);
  });
});
