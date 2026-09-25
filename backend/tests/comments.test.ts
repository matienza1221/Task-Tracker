import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { authed } from './helpers/auth';
import { createProjectFixture, createTaskFixture } from './helpers/db';
import { createUserWithSession } from './helpers/scenarios';

async function scenario() {
  const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
  const developer = await createUserWithSession(app, { email: 'dev@example.com', globalRole: 'DEVELOPER' });
  const other = await createUserWithSession(app, { email: 'other@example.com', globalRole: 'DEVELOPER' });
  const outsider = await createUserWithSession(app, { email: 'outsider@example.com', globalRole: 'DEVELOPER' });
  const project = await createProjectFixture({ manager: pm.user, code: 'CHAT' });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: developer.user.id, projectRole: 'DEVELOPER' } });
  const task = await createTaskFixture({ projectId: project.id, reporter: pm.user, assigneeId: developer.user.id, title: 'Discuss me' });
  return { pm, developer, other, outsider, project, task };
}

describe('comments', () => {
  it('creates and lists comments with author details', async () => {
    const { pm, developer, task } = await scenario();

    const created = await authed(app, developer.client)
      .post(`/api/tasks/${task.id}/comments`)
      .send({ body: 'Setup Vite is done, starting on auth.' });
    expect(created.status).toBe(201);
    expect(created.body.data.comment).toMatchObject({
      body: 'Setup Vite is done, starting on auth.',
      editedAt: null,
    });
    expect(created.body.data.comment.author.displayName).toBe(developer.user.displayName);
    expect(created.body.data.comment.mentions).toEqual([]);

    const list = await authed(app, pm.client).get(`/api/tasks/${task.id}/comments`);
    expect(list.status).toBe(200);
    expect(list.body.data.comments).toHaveLength(1);
    expect(list.body.meta).toMatchObject({ page: 1, total: 1 });

    expect(await prisma.activityLog.count({ where: { action: 'COMMENT_CREATED', taskId: task.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'COMMENT_CREATED' } })).toBe(1);
  });

  it('records mentions and notifies mentioned members', async () => {
    const { pm, developer, task } = await scenario();

    const created = await authed(app, developer.client)
      .post(`/api/tasks/${task.id}/comments`)
      .send({ body: `@${pm.user.displayName} can you review the auth flow?`, mentionedUserIds: [pm.user.id] });

    expect(created.status).toBe(201);
    expect(created.body.data.comment.mentions.map((user: { id: string }) => user.id)).toEqual([pm.user.id]);

    const mentions = await prisma.commentMention.findMany({ where: { commentId: created.body.data.comment.id } });
    expect(mentions).toHaveLength(1);

    const mentionNotification = await prisma.notification.findFirst({
      where: { userId: pm.user.id, type: 'TASK_MENTIONED' },
    });
    expect(mentionNotification).not.toBeNull();
    expect(mentionNotification!.body).toContain('review the auth flow');
  });

  it('ignores mentions of inactive users, non-members and the author', async () => {
    const { pm, developer, other, task } = await scenario();

    const created = await authed(app, developer.client)
      .post(`/api/tasks/${task.id}/comments`)
      .send({
        body: 'Mentioning people who cannot see this task',
        mentionedUserIds: [other.user.id, developer.user.id, pm.user.id],
      });

    expect(created.status).toBe(201);
    const mentioned = created.body.data.comment.mentions.map((user: { id: string }) => user.id);
    expect(mentioned).toEqual([pm.user.id]);
    expect(await prisma.notification.count({ where: { userId: other.user.id } })).toBe(0);
  });

  it('notifies the assignee and reporter about new comments, but never the author', async () => {
    const { pm, developer, task } = await scenario();

    await authed(app, developer.client).post(`/api/tasks/${task.id}/comments`).send({ body: 'Progress update' });

    const assigneeNotifications = await prisma.notification.findMany({
      where: { userId: developer.user.id, type: 'TASK_COMMENTED' },
    });
    const reporterNotifications = await prisma.notification.findMany({
      where: { userId: pm.user.id, type: 'TASK_COMMENTED' },
    });
    expect(assigneeNotifications).toHaveLength(0);
    expect(reporterNotifications).toHaveLength(1);
  });

  it('validates the body and enforces project visibility', async () => {
    const { developer, outsider, task } = await scenario();

    expect((await authed(app, developer.client).post(`/api/tasks/${task.id}/comments`).send({ body: '   ' })).status).toBe(422);
    expect(
      (await authed(app, developer.client).post(`/api/tasks/${task.id}/comments`).send({ body: 'x'.repeat(10_001) })).status,
    ).toBe(422);
    expect(
      (await authed(app, outsider.client).post(`/api/tasks/${task.id}/comments`).send({ body: 'Not allowed' })).status,
    ).toBe(404);
    expect((await authed(app, outsider.client).get(`/api/tasks/${task.id}/comments`)).status).toBe(404);
  });

  it('lets authors edit and delete their own comments', async () => {
    const { developer, task } = await scenario();
    const created = await authed(app, developer.client)
      .post(`/api/tasks/${task.id}/comments`)
      .send({ body: 'First draft' });
    const commentId = created.body.data.comment.id;

    const edited = await authed(app, developer.client).patch(`/api/comments/${commentId}`).send({ body: 'Final wording' });
    expect(edited.status).toBe(200);
    expect(edited.body.data.comment.body).toBe('Final wording');
    expect(edited.body.data.comment.editedAt).not.toBeNull();

    const deleted = await authed(app, developer.client).delete(`/api/comments/${commentId}`);
    expect(deleted.status).toBe(200);
    const list = await authed(app, developer.client).get(`/api/tasks/${task.id}/comments`);
    expect(list.body.data.comments).toHaveLength(0);
    expect(await prisma.activityLog.count({ where: { action: 'COMMENT_DELETED' } })).toBe(1);
  });

  it('stops non-authors from editing but allows moderators to delete', async () => {
    const { pm, developer, other, task } = await scenario();
    const project = await prisma.project.findFirstOrThrow({ where: { id: task.projectId } });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: other.user.id, projectRole: 'DEVELOPER' } });
    const created = await authed(app, developer.client)
      .post(`/api/tasks/${task.id}/comments`)
      .send({ body: 'Only I can edit this' });
    const commentId = created.body.data.comment.id;

    const hijack = await authed(app, other.client).patch(`/api/comments/${commentId}`).send({ body: 'Hijacked' });
    expect(hijack.status).toBe(403);

    const otherDelete = await authed(app, other.client).delete(`/api/comments/${commentId}`);
    expect(otherDelete.status).toBe(403);

    const moderatorDelete = await authed(app, pm.client).delete(`/api/comments/${commentId}`);
    expect(moderatorDelete.status).toBe(200);
  });

  it('returns 404 for comments in other projects and unknown ids', async () => {
    const { pm, outsider, task } = await scenario();
    const created = await authed(app, pm.client).post(`/api/tasks/${task.id}/comments`).send({ body: 'Private' });

    const asOutsider = await authed(app, outsider.client)
      .patch(`/api/comments/${created.body.data.comment.id}`)
      .send({ body: 'Hijacked' });
    expect(asOutsider.status).toBe(404);

    const unknown = await authed(app, pm.client)
      .delete('/api/comments/11111111-1111-1111-1111-111111111111');
    expect(unknown.status).toBe(404);
  });
});
