import type { ActivityAction, Prisma, User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { logger } from '../../lib/logger';

export interface ActivityInput {
  projectId: string;
  taskId?: string | null;
  actor: Pick<User, 'id' | 'displayName'> | null;
  action: ActivityAction;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Append-only, human-readable project/task feed. Failures are logged but do not
 * break the request that produced the event.
 */
export async function recordActivity(input: ActivityInput): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        projectId: input.projectId,
        taskId: input.taskId ?? null,
        actorUserId: input.actor?.id ?? null,
        actorNameSnapshot: input.actor?.displayName ?? 'System',
        action: input.action,
        field: input.field ?? null,
        oldValue: input.oldValue ?? null,
        newValue: input.newValue ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (error) {
    logger.error({ err: error, action: input.action, projectId: input.projectId }, 'Failed to write activity log');
  }
}

export async function listActivity(
  projectId: string,
  options: { page: number; pageSize: number; taskId?: string },
) {
  // The project feed includes task events ("John was assigned DEV-142"); the
  // task feed filters to a single task.
  const where: Prisma.ActivityLogWhereInput = options.taskId
    ? { projectId, taskId: options.taskId }
    : { projectId };
  const [items, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
      include: { task: { select: { id: true, key: true } } },
    }),
    prisma.activityLog.count({ where }),
  ]);
  return { items, total };
}
