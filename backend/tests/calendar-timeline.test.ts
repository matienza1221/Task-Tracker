import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { authed } from './helpers/auth';
import { createMilestoneFixture, createProjectFixture, createTaskFixture } from './helpers/db';
import { createUserWithSession } from './helpers/scenarios';

async function scenario() {
  const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
  const developer = await createUserWithSession(app, { email: 'dev@example.com', globalRole: 'DEVELOPER' });
  const outsider = await createUserWithSession(app, { email: 'outsider@example.com', globalRole: 'PROJECT_MANAGER' });
  const project = await createProjectFixture({ manager: pm.user, code: 'CAL' });
  const foreignProject = await createProjectFixture({ manager: outsider.user, code: 'SOLO' });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: developer.user.id, projectRole: 'DEVELOPER' } });
  return { pm, developer, outsider, project, foreignProject };
}

describe('GET /api/calendar', () => {
  it('returns tasks that start or end inside the range plus milestones and projects', async () => {
    const { pm, project } = await scenario();
    const milestone = await createMilestoneFixture(project.id, 'Beta');
    await prisma.milestone.update({ where: { id: milestone.id }, data: { targetDate: new Date('2026-06-15T00:00:00.000Z') } });
    await prisma.project.update({ where: { id: project.id }, data: { targetDate: new Date('2026-06-30T00:00:00.000Z') } });

    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Due inside', dueDate: '2026-06-10' });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Starts inside', startDate: '2026-06-05', dueDate: '2026-07-20' });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Outside', dueDate: '2026-09-01' });

    const response = await authed(app, pm.client).get('/api/calendar?from=2026-06-01&to=2026-06-30');

    expect(response.status).toBe(200);
    const titles = response.body.data.tasks.map((task: { title: string }) => task.title).sort();
    expect(titles).toEqual(['Due inside', 'Starts inside']);
    expect(response.body.data.milestones).toHaveLength(1);
    expect(response.body.data.milestones[0].targetDate).toBe('2026-06-15');
    expect(response.body.data.projects).toHaveLength(1);
    expect(response.body.data.projects[0].targetDate).toBe('2026-06-30');
  });

  it('scopes results to accessible projects and validates the range', async () => {
    const { pm, outsider, project, foreignProject } = await scenario();
    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Mine', dueDate: '2026-06-10' });
    await createTaskFixture({ projectId: foreignProject.id, reporter: outsider.user, title: 'Theirs', dueDate: '2026-06-10' });

    const asDeveloperOnly = await authed(app, outsider.client).get('/api/calendar?from=2026-06-01&to=2026-06-30');
    expect(asDeveloperOnly.body.data.tasks.map((task: { title: string }) => task.title)).toEqual(['Theirs']);

    const invalidRange = await authed(app, pm.client).get('/api/calendar?from=2026-06-30&to=2026-06-01');
    expect(invalidRange.status).toBe(422);

    const missingRange = await authed(app, pm.client).get('/api/calendar');
    expect(missingRange.status).toBe(422);
  });

  it('filters by project, assignee, completion and search scope', async () => {
    const { pm, developer, project, foreignProject } = await scenario();
    await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      title: 'Assigned work',
      assigneeId: developer.user.id,
      dueDate: '2026-06-10',
    });
    await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      title: 'Completed work',
      statusKey: 'DONE',
      dueDate: '2026-06-12',
    });

    // Asking for a project the caller cannot see is rejected outright.
    const foreign = await authed(app, pm.client).get(
      `/api/calendar?from=2026-06-01&to=2026-06-30&projectId=${foreignProject.id}`,
    );
    expect(foreign.status).toBe(404);

    const ownProject = await authed(app, pm.client).get(
      `/api/calendar?from=2026-06-01&to=2026-06-30&projectId=${project.id}`,
    );
    expect(ownProject.body.data.tasks).toHaveLength(2);

    const byAssignee = await authed(app, pm.client).get(
      `/api/calendar?from=2026-06-01&to=2026-06-30&assignee=${developer.user.id}`,
    );
    expect(byAssignee.body.data.tasks).toHaveLength(1);

    const mine = await authed(app, developer.client).get('/api/calendar?from=2026-06-01&to=2026-06-30&scope=mine');
    expect(mine.body.data.tasks).toHaveLength(1);

    const openOnly = await authed(app, pm.client).get(
      '/api/calendar?from=2026-06-01&to=2026-06-30&includeCompleted=false',
    );
    expect(openOnly.body.data.tasks).toHaveLength(1);

    const foreignProjectFilter = await authed(app, developer.client).get(
      `/api/calendar?from=2026-06-01&to=2026-06-30&projectId=${foreignProject.id}`,
    );
    expect(foreignProjectFilter.status).toBe(404);
  });
});

describe('GET /api/projects/:projectId/timeline', () => {
  it('returns the project window, milestones and non-cancelled tasks', async () => {
    const { pm, developer, project } = await scenario();
    await prisma.project.update({
      where: { id: project.id },
      data: { startDate: new Date('2026-01-01T00:00:00.000Z'), targetDate: new Date('2026-12-31T00:00:00.000Z') },
    });
    const milestone = await createMilestoneFixture(project.id, 'GA');
    await prisma.milestone.update({ where: { id: milestone.id }, data: { targetDate: new Date('2026-08-01T00:00:00.000Z') } });

    await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      title: 'Scheduled',
      startDate: '2026-02-01',
      dueDate: '2026-03-15',
    });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Unscheduled' });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Cancelled', statusKey: 'CANCELLED' });

    const response = await authed(app, developer.client).get(`/api/projects/${project.id}/timeline`);

    expect(response.status).toBe(200);
    expect(response.body.data.project).toMatchObject({
      code: 'CAL',
      startDate: '2026-01-01',
      targetDate: '2026-12-31',
    });
    expect(response.body.data.milestones).toHaveLength(1);
    expect(response.body.data.milestones[0]).toMatchObject({ name: 'GA', taskCount: 0, progress: 0 });

    const titles = response.body.data.tasks.map((task: { title: string }) => task.title);
    expect(titles).toContain('Scheduled');
    expect(titles).toContain('Unscheduled');
    expect(titles).not.toContain('Cancelled');
    expect(response.body.data.truncated).toBe(false);
  });

  it('hides the timeline from users outside the project', async () => {
    const { pm, outsider, project } = await scenario();
    void pm;
    const response = await authed(app, outsider.client).get(`/api/projects/${project.id}/timeline`);
    expect(response.status).toBe(404);
  });
});
