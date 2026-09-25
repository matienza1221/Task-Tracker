import type { Comment, User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { getProjectAccess, projectRoleHasPermission } from '../../lib/access';
import { forbidden, notFound } from '../../lib/errors';
import { loadTaskForPermission } from '../../lib/resourceGuards';
import { recordActivity } from '../activity/service';
import { recordAudit } from '../audit/service';
import { notifyTaskEvent } from '../notifications/service';

export interface CommentDto {
  id: string;
  body: string;
  author: { id: string; displayName: string; avatarUrl: string | null };
  mentions: { id: string; displayName: string }[];
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type CommentWithRelations = Comment & {
  author: { id: string; displayName: string; avatarUrl: string | null };
  mentions: { user: { id: string; displayName: string } }[];
};

type CommentWithTask = CommentWithRelations & { task: { id: string; projectId: string; key: string } };

function toDto(comment: CommentWithRelations): CommentDto {
  return {
    id: comment.id,
    body: comment.body,
    author: comment.author,
    mentions: comment.mentions.map((mention) => mention.user),
    editedAt: comment.editedAt?.toISOString() ?? null,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}

const commentInclude = {
  author: { select: { id: true, displayName: true, avatarUrl: true } },
  mentions: { select: { user: { select: { id: true, displayName: true } } } },
} as const;

/**
 * Comment → task → project → permission resolution (IDOR guard).
 * `author-or-moderator` allows the comment's author (with `comment:update_own`)
 * or anyone holding `comment:moderate`; `moderate-only` is for actions that
 * must never be available to authors.
 */
export async function loadCommentForPermission(
  user: User,
  commentId: string,
  requirement: 'author-or-moderator' | 'moderate-only',
): Promise<{ comment: CommentWithTask; taskId: string; projectId: string; canModerate: boolean; isAuthor: boolean }> {
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, deletedAt: null },
    include: { ...commentInclude, task: { select: { id: true, projectId: true, key: true } } },
  });
  if (!comment) throw notFound('Comment not found.');

  const access = await getProjectAccess(user, comment.task.projectId);
  if (!access) throw notFound('Comment not found.');

  const isAuthor = comment.authorId === user.id;
  const canModerate = projectRoleHasPermission(access.role, 'comment:moderate');
  const canEditOwn = projectRoleHasPermission(access.role, 'comment:update_own');

  if (requirement === 'moderate-only' && !canModerate) throw forbidden();
  if (requirement === 'author-or-moderator' && !canModerate && !(isAuthor && canEditOwn)) throw forbidden();

  return { comment, taskId: comment.task.id, projectId: comment.task.projectId, canModerate, isAuthor };
}

export async function listComments(
  user: User,
  taskId: string,
  options: { page: number; pageSize: number },
): Promise<{ items: CommentDto[]; total: number }> {
  const { task } = await loadTaskForPermission(user, taskId, 'task:view');
  const where = { taskId: task.id, deletedAt: null };
  const [rows, total] = await Promise.all([
    prisma.comment.findMany({
      where,
      include: commentInclude,
      orderBy: { createdAt: 'asc' },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
    prisma.comment.count({ where }),
  ]);
  return { items: rows.map(toDto), total };
}

export async function createComment(
  user: User,
  taskId: string,
  input: { body: string; mentionedUserIds?: string[] },
): Promise<CommentDto> {
  const { task } = await loadTaskForPermission(user, taskId, 'comment:create');

  // Mentioned users must be active accounts with access to this project.
  const mentioned = new Set<string>();
  for (const userId of [...new Set(input.mentionedUserIds ?? [])]) {
    if (userId === user.id) continue;
    const account = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null, isActive: true },
      select: { id: true, globalRole: true },
    });
    if (!account) continue;
    const access = await getProjectAccess(account, task.projectId);
    if (!access) continue;
    mentioned.add(userId);
  }

  const comment = await prisma.comment.create({
    data: {
      taskId: task.id,
      authorId: user.id,
      body: input.body,
      mentions: mentioned.size
        ? { createMany: { data: [...mentioned].map((userId) => ({ userId })) } }
        : undefined,
    },
    include: commentInclude,
  });

  await recordActivity({
    projectId: task.projectId,
    taskId: task.id,
    actor: user,
    action: 'COMMENT_CREATED',
    metadata: { key: task.key, commentId: comment.id, mentions: [...mentioned] },
  });
  await recordAudit({
    action: 'COMMENT_CREATED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'comment',
    resourceId: comment.id,
    metadata: { projectId: task.projectId, taskId: task.id, mentions: mentioned.size },
  });

  // Mentioned users get a distinct, high-signal notification.
  if (mentioned.size > 0) {
    await notifyTaskEvent({
      taskId: task.id,
      actorId: user.id,
      type: 'TASK_MENTIONED',
      title: `${user.displayName} mentioned you on ${task.key}`,
      body: input.body.slice(0, 200),
      extraUserIds: [...mentioned],
      commentId: comment.id,
    });
  }
  await notifyTaskEvent({
    taskId: task.id,
    actorId: user.id,
    type: 'TASK_COMMENTED',
    title: `New comment on ${task.key}`,
    body: `${user.displayName}: ${input.body.slice(0, 200)}`,
    commentId: comment.id,
  });

  return toDto(comment);
}

export async function updateComment(user: User, commentId: string, input: { body: string }): Promise<CommentDto> {
  const { comment } = await loadCommentForPermission(user, commentId, 'author-or-moderator');

  const updated = await prisma.comment.update({
    where: { id: comment.id },
    data: { body: input.body, editedAt: new Date() },
    include: commentInclude,
  });

  await recordActivity({
    projectId: comment.task.projectId,
    taskId: comment.taskId,
    actor: user,
    action: 'COMMENT_CREATED',
    field: 'body',
    metadata: { key: comment.task.key, commentId: comment.id, edited: true },
  });
  await recordAudit({
    action: 'COMMENT_CREATED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'comment',
    resourceId: comment.id,
    metadata: { edited: true },
  });

  return toDto(updated);
}

export async function deleteComment(user: User, commentId: string): Promise<void> {
  const { comment } = await loadCommentForPermission(user, commentId, 'author-or-moderator');

  await prisma.comment.update({ where: { id: comment.id }, data: { deletedAt: new Date() } });

  await recordActivity({
    projectId: comment.task.projectId,
    taskId: comment.taskId,
    actor: user,
    action: 'COMMENT_DELETED',
    metadata: { key: comment.task.key, commentId: comment.id },
  });
  await recordAudit({
    action: 'COMMENT_DELETED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'comment',
    resourceId: comment.id,
    metadata: { projectId: comment.task.projectId },
  });
}
