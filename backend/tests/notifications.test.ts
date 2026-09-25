import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { runDueReminders } from '../src/modules/notifications/service';
import { authed } from './helpers/auth';
import { createProjectFixture, createTaskFixture } from './helpers/db';
import { createUserWithSession } from './helpers/scenarios';

async function scenario() {
  const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
  const developer = await createUserWithSession(app, { email: 'dev@example.com', globalRole: 'DEVELOPER' });
  const outsider = await createUserWithSession(app, { email: 'outsider@example.com', globalRole: 'DEVELOPER' });
  const project = await createProjectFixture({ manager: pm.user, code: 'NOTIF' });
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: developer.user.id, projectRole: 'DEVELOPER' },
  });
  return { pm, developer, outsider, project };
}

function daysFromToday(days: number): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
  return date.toISOString().slice(0, 10);
}

describe('notification triggers', () => {
  it('notifies the assignee when a task is assigned, never the actor', async () => {
    const { pm, developer, project } = await scenario();
    const task = await createTaskFixture({ projectId: project.id, reporter: pm.user });

    const response = await authed(app, pm.client)
      .patch(`/api/tasks/${task.id}/assignee`)
      .send({ assigneeId: developer.user.id, version: task.version });
    expect(response.status).toBe(200);

    const notifications = await prisma.notification.findMany({ where: { userId: developer.user.id } });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('TASK_ASSIGNED');
    expect(notifications[0].title).toContain(task.key);
    expect(await prisma.notification.count({ where: { userId: pm.user.id } })).toBe(0);
  });

  it('notifies the assignee and reporter about status changes, excluding the actor', async () => {
    const { pm, developer, project } = await scenario();
    const task = await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      assigneeId: developer.user.id,
      statusKey: 'TODO',
    });
    const done = await prisma.taskStatus.findFirstOrThrow({ where: { key: 'DONE' } });

    await authed(app, developer.client)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ statusId: done.id, version: task.version });

    const reporterNotifications = await prisma.notification.findMany({ where: { userId: pm.user.id } });
    expect(reporterNotifications).toHaveLength(1);
    expect(reporterNotifications[0].type).toBe('TASK_STATUS_CHANGED');
    expect(reporterNotifications[0].body).toBe(task.title);
    expect(await prisma.notification.count({ where: { userId: developer.user.id } })).toBe(0);
  });

  it('notifies assignees for bulk assignment and bulk status changes', async () => {
    const { pm, developer, project } = await scenario();
    const first = await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Bulk one' });
    const second = await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Bulk two' });

    const assign = await authed(app, pm.client)
      .post('/api/tasks/bulk')
      .send({ taskIds: [first.id, second.id], action: 'set-assignee', assigneeId: developer.user.id });
    expect(assign.status).toBe(200);
    expect(await prisma.notification.count({ where: { userId: developer.user.id, type: 'TASK_ASSIGNED' } })).toBe(2);

    const done = await prisma.taskStatus.findFirstOrThrow({ where: { key: 'DONE' } });
    const status = await authed(app, pm.client)
      .post('/api/tasks/bulk')
      .send({ taskIds: [first.id, second.id], action: 'set-status', statusId: done.id });
    expect(status.status).toBe(200);
    expect(await prisma.notification.count({ where: { userId: developer.user.id, type: 'TASK_STATUS_CHANGED' } })).toBe(2);
    // The reporter (and actor) is not notified about their own bulk action.
    expect(await prisma.notification.count({ where: { userId: pm.user.id } })).toBe(0);
  });

  it('notifies a user when they are added to a project', async () => {
    const { pm, project } = await scenario();
    const newcomer = await createUserWithSession(app, { email: 'newcomer@example.com', globalRole: 'DEVELOPER' });

    const response = await authed(app, pm.client)
      .post(`/api/projects/${project.id}/members`)
      .send({ userId: newcomer.user.id, projectRole: 'VIEWER' });
    expect(response.status).toBe(201);

    const notification = await prisma.notification.findFirst({ where: { userId: newcomer.user.id } });
    expect(notification).not.toBeNull();
    expect(notification!.type).toBe('PROJECT_MEMBER_ADDED');
    expect(notification!.entityId).toBe(project.id);
  });
});

describe('notification inbox', () => {
  async function seedNotification(userId: string, projectId: string, title: string, isRead = false) {
    return prisma.notification.create({
      data: {
        userId,
        type: 'TASK_COMMENTED',
        title,
        entityType: 'task',
        entityId: '11111111-1111-1111-1111-111111111111',
        projectId,
        isRead,
        readAt: isRead ? new Date() : null,
      },
    });
  }

  it('lists only the caller\u2019s notifications with an unread count', async () => {
    const { pm, developer, project } = await scenario();
    await seedNotification(pm.user.id, project.id, 'Mine unread');
    await seedNotification(pm.user.id, project.id, 'Mine read', true);
    await seedNotification(developer.user.id, project.id, 'Not mine');

    const response = await authed(app, pm.client).get('/api/notifications');
    expect(response.status).toBe(200);
    expect(response.body.data.notifications).toHaveLength(2);
    expect(response.body.meta).toMatchObject({ total: 2, unreadCount: 1 });

    const unreadOnly = await authed(app, pm.client).get('/api/notifications?unreadOnly=true');
    expect(unreadOnly.body.data.notifications).toHaveLength(1);
    expect(unreadOnly.body.data.notifications[0].isRead).toBe(false);
  });

  it('marks notifications read and unread, and supports read-all', async () => {
    const { pm, project } = await scenario();
    const first = await seedNotification(pm.user.id, project.id, 'First');
    await seedNotification(pm.user.id, project.id, 'Second');

    const marked = await authed(app, pm.client).patch(`/api/notifications/${first.id}/read`).send({ read: true });
    expect(marked.status).toBe(200);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: first.id } })).isRead).toBe(true);

    const unmarked = await authed(app, pm.client).patch(`/api/notifications/${first.id}/read`).send({ read: false });
    expect(unmarked.status).toBe(200);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: first.id } })).isRead).toBe(false);

    const all = await authed(app, pm.client).post('/api/notifications/read-all').send();
    expect(all.status).toBe(200);
    expect(all.body.data.updated).toBe(2);
    expect(await prisma.notification.count({ where: { userId: pm.user.id, isRead: false } })).toBe(0);
  });

  it('returns 404 when touching someone else\u2019s notification', async () => {
    const { pm, developer, project } = await scenario();
    const notification = await seedNotification(developer.user.id, project.id, 'Private');

    const response = await authed(app, pm.client).patch(`/api/notifications/${notification.id}/read`).send({ read: true });
    expect(response.status).toBe(404);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } })).isRead).toBe(false);
  });
});

describe('scheduled reminders', () => {
  it('creates due-soon and overdue reminders once per task, assignee and day', async () => {
    const { pm, developer, project } = await scenario();
    await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      assigneeId: developer.user.id,
      title: 'Due tomorrow',
      statusKey: 'IN_PROGRESS',
      dueDate: daysFromToday(1),
    });
    await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      assigneeId: developer.user.id,
      title: 'Overdue since yesterday',
      statusKey: 'IN_PROGRESS',
      dueDate: daysFromToday(-1),
    });

    const first = await runDueReminders();
    expect(first).toMatchObject({ dueSoon: 1, overdue: 1 });
    expect(await prisma.notification.count({ where: { userId: developer.user.id, type: 'TASK_DUE_SOON' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: developer.user.id, type: 'TASK_OVERDUE' } })).toBe(1);

    // A second sweep on the same day must not duplicate anything.
    const second = await runDueReminders();
    expect(second).toMatchObject({ dueSoon: 1, overdue: 1 });
    expect(await prisma.notification.count({ where: { userId: developer.user.id } })).toBe(2);
  });

  it('ignores completed, cancelled, unassigned and far-future tasks', async () => {
    const { pm, developer, project } = await scenario();
    await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      assigneeId: developer.user.id,
      title: 'Far future',
      dueDate: daysFromToday(30),
    });
    await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      assigneeId: developer.user.id,
      title: 'Already done',
      statusKey: 'DONE',
      dueDate: daysFromToday(-3),
    });
    await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      assigneeId: developer.user.id,
      title: 'Cancelled work',
      statusKey: 'CANCELLED',
      dueDate: daysFromToday(-2),
    });
    await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      title: 'Nobody owns this',
      dueDate: daysFromToday(-4),
    });

    const result = await runDueReminders();
    expect(result).toMatchObject({ dueSoon: 0, overdue: 0 });
    expect(await prisma.notification.count()).toBe(0);
  });

  it('requires authentication for the inbox', async () => {
    const response = await request(app).get('/api/notifications');
    expect(response.status).toBe(401);
  });
});
