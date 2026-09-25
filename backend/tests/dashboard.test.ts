import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { authed } from './helpers/auth';
import { createMilestoneFixture, createProjectFixture, createTaskFixture } from './helpers/db';
import { createUserWithSession } from './helpers/scenarios';

function daysFromToday(days: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

describe('GET /api/dashboard/summary', () => {
  it('aggregates only the projects the caller can access', async () => {
    const alice = await createUserWithSession(app, { email: 'alice@example.com', globalRole: 'PROJECT_MANAGER' });
    const bob = await createUserWithSession(app, { email: 'bob@example.com', globalRole: 'PROJECT_MANAGER' });
    const admin = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });

    const aliceProject = await createProjectFixture({ manager: alice.user, code: 'ALICE', statusKey: 'ACTIVE' });
    const bobProject = await createProjectFixture({ manager: bob.user, code: 'BOB', statusKey: 'PLANNING' });

    await createTaskFixture({ projectId: aliceProject.id, reporter: alice.user, title: 'Alice open', statusKey: 'IN_PROGRESS' });
    await createTaskFixture({ projectId: aliceProject.id, reporter: alice.user, title: 'Alice done', statusKey: 'DONE' });
    await createTaskFixture({ projectId: aliceProject.id, reporter: alice.user, title: 'Alice overdue', dueDate: daysFromToday(-3) });
    await createTaskFixture({ projectId: bobProject.id, reporter: bob.user, title: 'Bob open' });

    const aliceSummary = await authed(app, alice.client).get('/api/dashboard/summary');
    expect(aliceSummary.status).toBe(200);
    expect(aliceSummary.body.data.projects).toMatchObject({ total: 1, active: 1, planning: 0 });
    expect(aliceSummary.body.data.tasks).toMatchObject({ total: 3, inProgress: 1, done: 1, overdue: 1 });

    const bobSummary = await authed(app, bob.client).get('/api/dashboard/summary');
    expect(bobSummary.body.data.projects).toMatchObject({ total: 1, active: 0, planning: 1 });
    expect(bobSummary.body.data.tasks.total).toBe(1);
    expect(bobSummary.body.data.tasks.overdue).toBe(0);

    const adminSummary = await authed(app, admin.client).get('/api/dashboard/summary');
    expect(adminSummary.body.data.projects.total).toBe(2);
    expect(adminSummary.body.data.tasks.total).toBe(4);
  });

  it('breaks tasks down by workflow category, due window and assignment', async () => {
    const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const developer = await createUserWithSession(app, { email: 'dev@example.com', globalRole: 'DEVELOPER' });
    const project = await createProjectFixture({ manager: pm.user, code: 'STATS' });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: developer.user.id, projectRole: 'DEVELOPER' } });

    await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'BACKLOG' });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'TODO' });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'IN_REVIEW' });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'TESTING' });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'BLOCKED' });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'CANCELLED' });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, assigneeId: developer.user.id, dueDate: daysFromToday(0) });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, dueDate: daysFromToday(3) });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, dueDate: daysFromToday(20) });
    const blocker = await createTaskFixture({ projectId: project.id, reporter: pm.user, statusKey: 'IN_PROGRESS' });
    const waiting = await createTaskFixture({ projectId: project.id, reporter: pm.user });
    await authed(app, pm.client)
      .post(`/api/tasks/${waiting.id}/dependencies`)
      .send({ dependsOnTaskId: blocker.id });

    const response = await authed(app, pm.client).get('/api/dashboard/summary');
    const tasks = response.body.data.tasks;

    // 9 explicit tasks plus the blocker and the waiting task created for the
    // dependency check; only one task is assigned.
    expect(tasks).toMatchObject({
      total: 11,
      // The three due-date tasks have no explicit status, so they default to Backlog.
      backlog: 5,
      todo: 1,
      inProgress: 1,
      inReview: 1,
      testing: 1,
      blocked: 1,
      cancelled: 1,
      dueToday: 1,
      dueThisWeek: 1,
      // Open tasks with no assignee: 11 total minus the assigned one and the cancelled one.
      unassigned: 9,
      waitingOnDependencies: 1,
    });
  });

  it('summarises my work, upcoming milestones and recent projects', async () => {
    const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const project = await createProjectFixture({ manager: pm.user, code: 'MINE' });
    const soon = await createMilestoneFixture(project.id, 'Soon');
    await prisma.milestone.update({ where: { id: soon.id }, data: { targetDate: new Date(`${daysFromToday(10)}T00:00:00.000Z`) } });
    const far = await createMilestoneFixture(project.id, 'Far away');
    await prisma.milestone.update({ where: { id: far.id }, data: { targetDate: new Date(`${daysFromToday(90)}T00:00:00.000Z`) } });

    await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      title: 'Mine overdue',
      assigneeId: pm.user.id,
      dueDate: daysFromToday(-1),
    });
    await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      title: 'Mine due soon',
      assigneeId: pm.user.id,
      dueDate: daysFromToday(2),
    });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Not mine' });

    const response = await authed(app, pm.client).get('/api/dashboard/summary');
    const data = response.body.data;

    expect(data.myWork).toMatchObject({ open: 2, overdue: 1, dueThisWeek: 1 });
    expect(data.myWork.recentlyUpdated.length).toBeGreaterThan(0);
    expect(data.myWork.recentlyCreated.length).toBeGreaterThan(0);
    expect(data.myWork.recentlyCreated.every((task: { reporter: { id: string } | null }) => task.reporter?.id === pm.user.id)).toBe(true);

    expect(data.upcomingMilestones).toHaveLength(1);
    expect(data.upcomingMilestones[0].name).toBe('Soon');
    expect(data.upcomingMilestones[0].project.code).toBe('MINE');
    expect(data.recentProjects[0].code).toBe('MINE');
  });

  it('requires authentication', async () => {
    const { default: request } = await import('supertest');
    const response = await request(app).get('/api/dashboard/summary');
    expect(response.status).toBe(401);
  });
});
