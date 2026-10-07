import type { Prisma, User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { assertProjectPermission, projectRoleHasPermission } from '../../lib/access';
import { conflict, forbidden, notFound, validationError } from '../../lib/errors';
import { optimisticWrite } from '../../lib/optimistic';
import { recalculateProjectProgress, recalculateTaskProgress } from '../../lib/progress';
import { recordActivity } from '../activity/service';
import { recordAudit } from '../audit/service';
import { notifyTaskEvent } from '../notifications/service';
import { taskListInclude, toTaskDto, type TaskDto } from './dto';
import {
  getTask,
  hasSubtasks,
  resolvePriority,
  resolveStatus,
  statusSideEffects,
} from './taskService';
import type { BoardQuery, BulkTaskInput, TaskListQuery } from './schemas';
import { loadTaskForPermission } from '../../lib/resourceGuards';

const BOARD_TASK_LIMIT = 1000;

export interface BoardColumnDto {
  status: { id: string; key: string; name: string; category: string; color: string };
  tasks: TaskDto[];
}

export interface BoardDto {
  columns: BoardColumnDto[];
  totalTasks: number;
  truncated: boolean;
}

/**
 * Kanban board for one project: active statuses become columns (ordered by
 * sortOrder) and top-level tasks are ordered within each column by their board
 * position. Cancelled work is hidden unless explicitly requested.
 */
export async function getBoard(user: User, projectId: string, query: BoardQuery): Promise<BoardDto> {
  const access = await assertProjectPermission(user, projectId, 'task:view');

  const and: Prisma.TaskWhereInput[] = [];
  if (query.q) {
    and.push({
      OR: [
        { key: { equals: query.q.toUpperCase() } },
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }
  if (query.priority?.length) and.push({ priority: { key: { in: query.priority } } });
  if (query.assignee?.length) and.push({ assigneeId: { in: query.assignee } });
  if (query.label?.length) and.push({ labels: { some: { labelId: { in: query.label } } } });
  if (query.milestone?.length) and.push({ milestoneId: { in: query.milestone } });
  if (query.scope === 'mine') and.push({ assigneeId: user.id });
  if (query.scope === 'unassigned') and.push({ assigneeId: null });
  if (query.blocked) {
    and.push({
      OR: [
        { status: { category: 'BLOCKED' } },
        {
          dependencies: {
            some: { dependsOn: { deletedAt: null, status: { category: { notIn: ['DONE', 'CANCELLED'] } } } },
          },
        },
      ],
    });
  }

  const tasks = await prisma.task.findMany({
    where: {
      projectId: access.project.id,
      deletedAt: null,
      parentTaskId: null,
      AND: and,
    },
    include: taskListInclude,
    orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }],
    take: BOARD_TASK_LIMIT,
  });

  const statuses = await prisma.taskStatus.findMany({
    where: query.includeCancelled ? {} : { category: { not: 'CANCELLED' } },
    orderBy: { sortOrder: 'asc' },
  });

  const columns: BoardColumnDto[] = statuses.map((status) => ({
    status: {
      id: status.id,
      key: status.key,
      name: status.name,
      category: status.category,
      color: status.color,
    },
    tasks: tasks
      .filter((task) => task.statusId === status.id)
      .map((task) => {
        const active = task.subtasks.filter((subtask) => subtask.status.category !== 'CANCELLED');
        return toTaskDto(task, {
          subtaskCount: active.length,
          completedSubtaskCount: active.filter((subtask) => subtask.status.category === 'DONE').length,
        });
      }),
  }));

  return { columns, totalTasks: tasks.length, truncated: tasks.length >= BOARD_TASK_LIMIT };
}

/**
 * Board move: places a task at a specific index of the target column and
 * renumbers that column so positions stay dense. `version` guards against
 * moving a card that someone else changed in the meantime.
 */
export async function moveTask(
  user: User,
  taskId: string,
  statusId: string,
  targetIndex: number,
  version: number,
): Promise<TaskDto> {
  const { task } = await loadTaskForPermission(user, taskId, 'task:update_status');
  if (version !== task.version) {
    throw conflictError();
  }

  const targetStatus = await resolveStatus(statusId);
  const currentStatus = await prisma.taskStatus.findUniqueOrThrow({
    where: { id: task.statusId },
    select: { name: true, category: true },
  });
  const statusChanged = task.statusId !== targetStatus.id;
  const hasChildren = await hasSubtasks(task.id);

  const orderedIds = await prisma.$transaction(async (tx) => {
    const siblings = await tx.task.findMany({
      where: {
        projectId: task.projectId,
        statusId: targetStatus.id,
        deletedAt: null,
        id: { not: task.id },
      },
      orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }],
      select: { id: true },
    });

    const ordered = siblings.map((sibling) => sibling.id);
    const index = Math.max(0, Math.min(targetIndex, ordered.length));
    ordered.splice(index, 0, task.id);

    await optimisticWrite(
      () =>
        tx.task.update({
          where: { id: task.id, version },
          data: {
            statusId: targetStatus.id,
            version: { increment: 1 },
            ...(statusChanged
              ? statusSideEffects(
                  { category: currentStatus.category, progress: task.progress },
                  targetStatus.category,
                  hasChildren,
                )
              : {}),
          },
        }),
      'This task changed while you were moving it. The board has been refreshed.',
    );

    await Promise.all(
      ordered.map((id, position) => tx.task.update({ where: { id }, data: { sortOrder: position } })),
    );

    return ordered;
  });

  if (statusChanged) {
    await recordActivity({
      projectId: task.projectId,
      taskId: task.id,
      actor: user,
      action: 'TASK_STATUS_CHANGED',
      field: 'status',
      oldValue: currentStatus.name,
      newValue: targetStatus.name,
      metadata: { key: task.key, via: 'board' },
    });
    await recordAudit({
      action: 'TASK_STATUS_CHANGED',
      actorUserId: user.id,
      actorEmail: user.email,
      resourceType: 'task',
      resourceId: task.id,
      metadata: { projectId: task.projectId, from: currentStatus.name, to: targetStatus.name, via: 'board' },
    });
    await notifyTaskEvent({
      taskId: task.id,
      actorId: user.id,
      type: 'TASK_STATUS_CHANGED',
      title: `${task.key}: ${currentStatus.name} → ${targetStatus.name}`,
      body: task.title,
    });
  } else {
    await recordActivity({
      projectId: task.projectId,
      taskId: task.id,
      actor: user,
      action: 'TASK_UPDATED',
      field: 'boardPosition',
      metadata: { key: task.key, position: orderedIds.indexOf(task.id) },
    });
  }

  await recalculateTaskProgress(task.id);
  await recalculateProjectProgress(task.projectId);

  return getTask(user, taskId);
}

function conflictError() {
  return conflict('This task changed while you were moving it. The board has been refreshed.');
}

export interface BulkResult {
  updated: number;
  action: BulkTaskInput['action'];
}

/**
 * Bulk operations for managers: every selected task is authorized
 * individually, so a single id outside the caller's projects aborts the whole
 * request (no partial updates across projects).
 */
export async function bulkUpdateTasks(user: User, input: BulkTaskInput): Promise<BulkResult> {
  const uniqueIds = [...new Set(input.taskIds)];
  const tasks = await prisma.task.findMany({
    where: { id: { in: uniqueIds }, deletedAt: null },
    select: { id: true, key: true, projectId: true, statusId: true, progress: true, title: true },
  });
  if (tasks.length !== uniqueIds.length) throw notFound('One or more tasks were not found.');

  const requiredPermission =
    input.action === 'delete' ? 'task:delete' : input.action === 'set-status' ? 'task:update_status' : 'task:update';

  // Authorize once per project (cached), failing the whole request on any miss.
  const accessByProject = new Map<string, Awaited<ReturnType<typeof assertProjectPermission>>>();
  for (const projectId of new Set(tasks.map((task) => task.projectId))) {
    accessByProject.set(projectId, await assertProjectPermission(user, projectId, requiredPermission));
  }

  if (input.action === 'set-assignee' && input.assigneeId && input.assigneeId !== user.id) {
    for (const access of accessByProject.values()) {
      if (!projectRoleHasPermission(access.role, 'task:assign')) {
        throw forbidden('Assigning tasks to other people requires the task:assign permission.');
      }
    }
    const assignee = await prisma.user.findFirst({
      where: { id: input.assigneeId, deletedAt: null, isActive: true },
      select: { id: true, displayName: true },
    });
    if (!assignee) {
      throw validationError('The selected assignee is not an active account.', [
        { path: 'assigneeId', message: 'The selected assignee is not an active account.' },
      ]);
    }
  }

  const affectedProjects = [...new Set(tasks.map((task) => task.projectId))];

  switch (input.action) {
    case 'set-status': {
      const status = await resolveStatus(input.statusId);
      for (const task of tasks) {
        const currentStatus = await prisma.taskStatus.findUniqueOrThrow({
          where: { id: task.statusId },
          select: { name: true, category: true },
        });
        const hasChildren = await hasSubtasks(task.id);
        const last = await prisma.task.findFirst({
          where: { projectId: task.projectId, statusId: status.id, deletedAt: null, id: { not: task.id } },
          orderBy: [{ sortOrder: 'desc' }],
          select: { sortOrder: true },
        });
        await prisma.task.update({
          where: { id: task.id },
          data: {
            statusId: status.id,
            version: { increment: 1 },
            sortOrder: last ? last.sortOrder + 1 : 0,
            ...statusSideEffects({ category: currentStatus.category, progress: task.progress }, status.category, hasChildren),
          },
        });
        await recordActivity({
          projectId: task.projectId,
          taskId: task.id,
          actor: user,
          action: 'TASK_STATUS_CHANGED',
          field: 'status',
          oldValue: currentStatus.name,
          newValue: status.name,
          metadata: { key: task.key, bulk: true },
        });
        await notifyTaskEvent({
          taskId: task.id,
          actorId: user.id,
          type: 'TASK_STATUS_CHANGED',
          title: `${task.key}: ${currentStatus.name} → ${status.name}`,
          body: task.title,
        });
      }
      break;
    }
    case 'set-priority': {
      const priority = await resolvePriority(input.priorityId);
      await prisma.task.updateMany({
        where: { id: { in: uniqueIds } },
        data: { priorityId: priority.id, version: { increment: 1 } },
      });
      for (const task of tasks) {
        await recordActivity({
          projectId: task.projectId,
          taskId: task.id,
          actor: user,
          action: 'TASK_UPDATED',
          field: 'priority',
          newValue: priority.name,
          metadata: { key: task.key, bulk: true },
        });
      }
      break;
    }
    case 'set-assignee': {
      const assigneeId = input.assigneeId ?? null;
      const assignee = assigneeId
        ? await prisma.user.findUniqueOrThrow({ where: { id: assigneeId }, select: { displayName: true } })
        : null;
      await prisma.task.updateMany({
        where: { id: { in: uniqueIds } },
        data: { assigneeId, version: { increment: 1 } },
      });
      for (const task of tasks) {
        await recordActivity({
          projectId: task.projectId,
          taskId: task.id,
          actor: user,
          action: 'TASK_ASSIGNED',
          field: 'assignee',
          newValue: assignee?.displayName ?? 'Unassigned',
          metadata: { key: task.key, assigneeId, bulk: true },
        });
        if (assigneeId) {
          await notifyTaskEvent({
            taskId: task.id,
            actorId: user.id,
            type: 'TASK_ASSIGNED',
            title: `You were assigned ${task.key}`,
            body: task.title,
            assigneeOnly: true,
          });
        }
      }
      break;
    }
    case 'delete': {
      await prisma.task.updateMany({
        where: { OR: [{ id: { in: uniqueIds } }, { parentTaskId: { in: uniqueIds } }], deletedAt: null },
        data: { deletedAt: new Date() },
      });
      for (const task of tasks) {
        await recordActivity({
          projectId: task.projectId,
          taskId: task.id,
          actor: user,
          action: 'TASK_DELETED',
          metadata: { key: task.key, title: task.title, bulk: true },
        });
      }
      break;
    }
    default:
      throw validationError('Unsupported bulk action.');
  }

  await recordAudit({
    action: input.action === 'delete' ? 'TASK_DELETED' : 'TASK_UPDATED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'task',
    metadata: { bulk: true, action: input.action, taskIds: uniqueIds, count: uniqueIds.length },
  });

  for (const task of tasks) await recalculateTaskProgress(task.id);
  for (const projectId of affectedProjects) await recalculateProjectProgress(projectId);

  return { updated: tasks.length, action: input.action };
}

/** Re-exported so the board controller can reuse the standard list contract. */
export type { TaskListQuery };
