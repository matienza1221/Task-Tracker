import type { NotificationType, Prisma, User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  entityType: 'task' | 'project' | 'comment';
  entityId: string;
  projectId?: string | null;
  taskId?: string | null;
  commentId?: string | null;
  /** Same-day reminder dedupe key; uniqueness is enforced by the database. */
  dedupeKey?: string | null;
}

/**
 * Creates one notification. A duplicate `dedupeKey` is swallowed (the unique
 * index makes reminders idempotent even if two workers race). Failures never
 * break the request that triggered them.
 */
export async function createNotification(input: NotificationInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        commentId: input.commentId ?? null,
        dedupeKey: input.dedupeKey ?? null,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') return;
    logger.error({ err: error, type: input.type, userId: input.userId }, 'Failed to create notification');
  }
}

export async function createNotifications(inputs: NotificationInput[]): Promise<void> {
  for (const input of inputs) await createNotification(input);
}

/**
 * Notifies the people interested in a task (assignee + reporter), excluding the
 * actor who caused the event and optionally including extra recipients (such as
 * mentioned users).
 */
export async function notifyTaskEvent(options: {
  taskId: string;
  actorId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  extraUserIds?: string[];
  commentId?: string | null;
  dedupeKey?: (userId: string) => string | null;
  /** Assignment notifications go to the new assignee only, not the reporter. */
  assigneeOnly?: boolean;
}): Promise<void> {
  const task = await prisma.task.findFirst({
    where: { id: options.taskId, deletedAt: null },
    select: { id: true, projectId: true, assigneeId: true, reporterId: true },
  });
  if (!task) return;

  const recipients = options.assigneeOnly
    ? [task.assigneeId].filter((userId): userId is string => Boolean(userId) && userId !== options.actorId)
    : notificationRecipients(task, options.actorId, options.extraUserIds ?? []);
  await createNotifications(
    recipients.map((userId) => ({
      userId,
      type: options.type,
      title: options.title,
      body: options.body ?? null,
      entityType: 'task' as const,
      entityId: task.id,
      projectId: task.projectId,
      taskId: task.id,
      commentId: options.commentId ?? null,
      dedupeKey: options.dedupeKey ? options.dedupeKey(userId) : null,
    })),
  );
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string;
  entityId: string;
  projectId: string | null;
  taskId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

function toDto(row: {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string;
  entityId: string;
  projectId: string | null;
  taskId: string | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    entityType: row.entityType,
    entityId: row.entityId,
    projectId: row.projectId,
    taskId: row.taskId,
    isRead: row.isRead,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listNotifications(
  userId: string,
  options: { unreadOnly?: boolean; page: number; pageSize: number },
): Promise<{ items: NotificationDto[]; total: number; unreadCount: number }> {
  const where: Prisma.NotificationWhereInput = { userId, ...(options.unreadOnly ? { isRead: false } : {}) };
  const [rows, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);
  return { items: rows.map(toDto), total, unreadCount };
}

/** Returns true when the notification exists and belongs to the user. */
export async function markNotificationRead(userId: string, notificationId: string, read = true): Promise<boolean> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: read, readAt: read ? new Date() : null },
  });
  return result.count > 0;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return result.count;
}

export async function countUnread(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export interface ReminderResult {
  dueSoon: number;
  overdue: number;
}

/**
 * Scheduled reminder sweep: tasks due within the configured window and overdue
 * tasks. One notification per task/assignee/day thanks to `dedupeKey`.
 */
export async function runDueReminders(now = new Date()): Promise<ReminderResult> {
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const soon = new Date(startOfToday.getTime() + env.DUE_SOON_DAYS * 24 * 60 * 60 * 1000);
  const dayKey = startOfToday.toISOString().slice(0, 10);

  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      completedAt: null,
      assigneeId: { not: null },
      dueDate: { not: null, lte: soon },
      status: { category: { notIn: ['DONE', 'CANCELLED'] } },
    },
    select: {
      id: true,
      key: true,
      title: true,
      dueDate: true,
      assigneeId: true,
      projectId: true,
    },
    take: 2000,
  });

  let dueSoon = 0;
  let overdue = 0;

  for (const task of tasks) {
    if (!task.dueDate || !task.assigneeId) continue;
    const isOverdue = task.dueDate.getTime() < startOfToday.getTime();
    const type: NotificationType = isOverdue ? 'TASK_OVERDUE' : 'TASK_DUE_SOON';
    const dueDate = task.dueDate.toISOString().slice(0, 10);

    await createNotification({
      userId: task.assigneeId,
      type,
      title: isOverdue ? `${task.key} is overdue` : `${task.key} is due soon`,
      body: isOverdue
        ? `“${task.title}” was due on ${dueDate}.`
        : `“${task.title}” is due on ${dueDate}.`,
      entityType: 'task',
      entityId: task.id,
      projectId: task.projectId,
      taskId: task.id,
      dedupeKey: `${type}:${task.id}:${task.assigneeId}:${dayKey}`,
    });

    if (isOverdue) overdue += 1;
    else dueSoon += 1;
  }

  return { dueSoon, overdue };
}

export function notificationRecipients(
  task: { assigneeId: string | null; reporterId: string | null },
  actorId: string,
  extra: string[] = [],
): string[] {
  const recipients = new Set<string>();
  if (task.assigneeId && task.assigneeId !== actorId) recipients.add(task.assigneeId);
  if (task.reporterId && task.reporterId !== actorId) recipients.add(task.reporterId);
  for (const userId of extra) {
    if (userId !== actorId) recipients.add(userId);
  }
  return [...recipients];
}

export type NotificationActor = Pick<User, 'id' | 'displayName'>;
