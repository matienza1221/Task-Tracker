import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { authed } from './helpers/auth';
import { createMilestoneFixture, createProjectFixture, createTaskFixture } from './helpers/db';
import { createUserWithSession } from './helpers/scenarios';

async function scenario() {
  const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
  const developer = await createUserWithSession(app, { email: 'dev@example.com', globalRole: 'DEVELOPER' });
  const project = await createProjectFixture({ manager: pm.user, code: 'MILE' });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: developer.user.id, projectRole: 'DEVELOPER' } });
  return { pm, developer, project };
}

describe('milestone progress', () => {
  it('derives progress and counts from linked tasks', async () => {
    const { pm, project } = await scenario();
    const milestone = await createMilestoneFixture(project.id, 'MVP Release');

    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Auth', milestoneId: milestone.id, progress: 100, statusKey: 'DONE' });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Dashboard', milestoneId: milestone.id, progress: 50 });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Testing', milestoneId: milestone.id, progress: 0 });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Unrelated' });
    await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      title: 'Cancelled work',
      milestoneId: milestone.id,
      statusKey: 'CANCELLED',
      progress: 0,
    });

    const response = await authed(app, pm.client).get(`/api/projects/${project.id}/milestones`);
    expect(response.status).toBe(200);
    const dto = response.body.data.milestones.find((item: { id: string }) => item.id === milestone.id);

    // Cancelled tasks are excluded from the milestone maths.
    expect(dto.taskCount).toBe(3);
    expect(dto.completedTaskCount).toBe(1);
    expect(dto.progress).toBe(50); // (100 + 50 + 0) / 3
    expect(dto.overdueTaskCount).toBe(0);
  });

  it('counts overdue linked tasks and reflects relinking', async () => {
    const { pm, project } = await scenario();
    const milestone = await createMilestoneFixture(project.id, 'Release 2');
    const task = await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      title: 'Late work',
      milestoneId: milestone.id,
      dueDate: '2020-01-01',
      progress: 20,
    });

    let list = await authed(app, pm.client).get(`/api/projects/${project.id}/milestones`);
    let dto = list.body.data.milestones[0];
    expect(dto.overdueTaskCount).toBe(1);
    expect(dto.progress).toBe(20);

    // Unlinking removes it from the milestone maths.
    await authed(app, pm.client)
      .patch(`/api/tasks/${task.id}`)
      .send({ version: task.version, milestoneId: null });
    list = await authed(app, pm.client).get(`/api/projects/${project.id}/milestones`);
    dto = list.body.data.milestones[0];
    expect(dto.taskCount).toBe(0);
    expect(dto.progress).toBe(0);

    // Relinking to another milestone moves the numbers with it.
    const other = await createMilestoneFixture(project.id, 'Release 3');
    const refreshed = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    await authed(app, pm.client)
      .patch(`/api/tasks/${task.id}`)
      .send({ version: refreshed.version, milestoneId: other.id });
    list = await authed(app, pm.client).get(`/api/projects/${project.id}/milestones`);
    const second = list.body.data.milestones.find((item: { id: string }) => item.id === other.id);
    expect(second.taskCount).toBe(1);
    expect(second.completedTaskCount).toBe(0);
  });

  it('keeps milestone permissions unchanged', async () => {
    const { pm, developer, project } = await scenario();
    const milestone = await createMilestoneFixture(project.id, 'Guarded');

    const asDeveloper = await authed(app, developer.client)
      .patch(`/api/projects/${project.id}/milestones/${milestone.id}`)
      .send({ name: 'Renamed by developer' });
    expect(asDeveloper.status).toBe(403);

    const list = await authed(app, developer.client).get(`/api/projects/${project.id}/milestones`);
    expect(list.status).toBe(200);
    expect(list.body.data.milestones[0]).toMatchObject({ taskCount: 0, progress: 0 });

    const asManager = await authed(app, pm.client)
      .patch(`/api/projects/${project.id}/milestones/${milestone.id}`)
      .send({ name: 'Renamed by manager' });
    expect(asManager.status).toBe(200);
  });
});
