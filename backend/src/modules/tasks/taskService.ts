import type { ActivityAction, Prisma, Task, TaskStatus, User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { accessibleProjectWhere, assertProjectPermission, getProjectAccess, projectRoleHasPermission } from '../../lib/access';
import { conflict, forbidden, notFound, validationError } from '../../lib/errors';
import { recalculateProjectProgress, recalculateTaskProgress } from '../../lib/progress';
import { parseDateOnly, startOfTodayUtc } from '../../lib/validation';
import { recordActivity } from '../activity/service';
import { recordAudit } from '../audit/service';
import { notifyTaskEvent } from '../notifications/service';
import {
  countsFromListRow,
  taskDetailInclude,
  taskListInclude,
  toTaskDto,
  type TaskDto,
  type TaskListRow,
  type TaskWithRelations,
} from './dto';
import { loadTaskForPermission } from '../../lib/resourceGuards';
import { toDependencyRef, type DependencyRef } from '../../lib/dependencies';
import { dependencySelect } from '../dependencies/service';
import type { CreateTaskInput, TaskListQuery, UpdateTaskInput } from './schemas';

const SORTABLE: Record<string, Prisma.TaskOrderByWithRelationInput> = {
  key: { number: 'asc' },
  number: { number: 'asc' },
  title: { title: 'asc' },
  createdAt: { createdAt: 'asc' },
  updatedAt: { updatedAt: 'asc' },
  dueDate: { dueDate: 'asc' },
  priority: { priority: { weight: 'asc' } },
  progress: { progress: 'asc' },
};

/**
 * Sort allowlist. A leading '-' reverses the direction; unknown fields fall
 * back to most-recently-updated so arbitrary column names can never reach SQL.
 */
function orderByFromSort(sort: string): Prisma.TaskOrderByWithRelationInput[] {
  const descending = sort.startsWith('-');
  const field = descending ? sort.slice(1) : sort;
  switch (field) {
    case 'key':
    case 'number':
      return [{ number: descending ? 'desc' : 'asc' }];
    case 'title':
      return [{ title: descending ? 'desc' : 'asc' }];
    case 'createdAt':
      return [{ createdAt: descending ? 'desc' : 'asc' }];
    case 'dueDate':
      return [{ dueDate: descending ? 'desc' : 'asc' }];
    case 'priority':
      return [{ priority: { weight: descending ? 'desc' : 'asc' } }];
    case 'progress':
      return [{ progress: descending ? 'desc' : 'asc' }];
    case 'updatedAt':
      return [{ updatedAt: descending ? 'desc' : 'asc' }];
    default:
      return [{ updatedAt: 'desc' }];
  }
}

/** Filters shared by the project-scoped and cross-project task lists. */
function buildFilterWhere(query: TaskListQuery, user: User): Prisma.TaskWhereInput[] {
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
  if (query.status?.length) and.push({ status: { key: { in: query.status } } });
  if (query.priority?.length) and.push({ priority: { key: { in: query.priority } } });
  if (query.type?.length) and.push({ type: { key: { in: query.type } } });
  if (query.assignee?.length) and.push({ assigneeId: { in: query.assignee } });
  if (query.reporter?.length) and.push({ reporterId: { in: query.reporter } });
  if (query.label?.length) and.push({ labels: { some: { labelId: { in: query.label } } } });
  if (query.milestone?.length) and.push({ milestoneId: { in: query.milestone } });
  if (query.parentTaskId) and.push({ parentTaskId: query.parentTaskId });

  if (query.scope === 'mine') and.push({ assigneeId: user.id });
  if (query.scope === 'unassigned') and.push({ assigneeId: null });

  if (query.subtasks === 'top') and.push({ parentTaskId: null });
  if (query.subtasks === 'only') and.push({ parentTaskId: { not: null } });

  if (query.overdue) {
    and.push({
      dueDate: { lt: startOfTodayUtc() },
      completedAt: null,
      status: { category: { notIn: ['DONE', 'CANCELLED'] } },
    });
  }
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
  if (query.includeCompleted === false) {
    and.push({ status: { category: { notIn: ['DONE', 'CANCELLED'] } } });
  }
  if (query.dueFrom) and.push({ dueDate: { gte: parseDateOnly(query.dueFrom) } });
  if (query.dueTo) and.push({ dueDate: { lte: parseDateOnly(query.dueTo) } });
  if (query.progressMin !== undefined) and.push({ progress: { gte: query.progressMin } });
  if (query.progressMax !== undefined) and.push({ progress: { lte: query.progressMax } });

  return and;
}

async function fetchTaskPage(
  where: Prisma.TaskWhereInput,
  query: TaskListQuery,
): Promise<{ items: TaskDto[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: taskListInclude,
      orderBy: orderByFromSort(query.sort),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.task.count({ where }),
  ]);

  return { items: (rows as TaskListRow[]).map((row) => toTaskDto(row, countsFromListRow(row))), total };
}

export async function listProjectTasks(
  user: User,
  projectId: string,
  query: TaskListQuery,
): Promise<{ items: TaskDto[]; total: number }> {
  const access = await assertProjectPermission(user, projectId, 'task:view');
  const where: Prisma.TaskWhereInput = {
    projectId: access.project.id,
    deletedAt: null,
    AND: buildFilterWhere(query, user),
  };
  return fetchTaskPage(where, query);
}

/** Cross-project "my tasks": always scoped to accessible projects and to me. */
export async function listMyTasks(user: User, query: TaskListQuery): Promise<{ items: TaskDto[]; total: number }> {
  const where: Prisma.TaskWhereInput = {
    deletedAt: null,
    assigneeId: user.id,
    project: { deletedAt: null, AND: [accessibleProjectWhere(user)] },
    AND: buildFilterWhere(query, user),
  };
  return fetchTaskPage(where, query);
}

export async function resolveStatus(statusId?: string): Promise<TaskStatus> {
  if (statusId) {
    const status = await prisma.taskStatus.findFirst({ where: { id: statusId, isActive: true } });
    if (!status) {
      throw validationError('Unknown or inactive status.', [{ path: 'statusId', message: 'Unknown or inactive status.' }]);
    }
    return status;
  }
  const fallback = await prisma.taskStatus.findFirst({
    where: { isActive: true },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
  });
  if (!fallback) throw notFound('No task status is configured.');
  return fallback;
}

export async function resolvePriority(priorityId?: string) {
  if (priorityId) {
    const priority = await prisma.taskPriority.findFirst({ where: { id: priorityId, isActive: true } });
    if (!priority) {
      throw validationError('Unknown or inactive priority.', [{ path: 'priorityId', message: 'Unknown or inactive priority.' }]);
    }
    return priority;
  }
  const fallback = await prisma.taskPriority.findFirst({
    where: { isActive: true },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
  });
  if (!fallback) throw notFound('No task priority is configured.');
  return fallback;
}

async function resolveType(typeId?: string) {
  if (typeId) {
    const type = await prisma.taskType.findFirst({ where: { id: typeId, isActive: true } });
    if (!type) throw validationError('Unknown or inactive type.', [{ path: 'typeId', message: 'Unknown or inactive type.' }]);
    return type;
  }
  const fallback = await prisma.taskType.findFirst({
    where: { isActive: true },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
  });
  if (!fallback) throw notFound('No task type is configured.');
  return fallback;
}

async function assertAssignee(assigneeId: string, projectId: string) {
  const assignee = await prisma.user.findFirst({ where: { id: assigneeId, deletedAt: null, isActive: true } });
  if (!assignee) {
    throw validationError('The selected assignee is not an active account.', [
      { path: 'assigneeId', message: 'The selected assignee is not an active account.' },
    ]);
  }
  const assigneeAccess = await getProjectAccess(assignee, projectId);
  if (!assigneeAccess) {
    throw validationError('The selected assignee does not have access to this project.', [
      {
        path: 'assigneeId',
        message: 'Add the user to the project before assigning work to them.',
      },
    ]);
  }
  return assignee;
}

async function assertParentTask(projectId: string, parentTaskId: string) {
  const parent = await prisma.task.findFirst({ where: { id: parentTaskId, projectId, deletedAt: null } });
  if (!parent) throw notFound('Parent task not found in this project.');
  if (parent.parentTaskId) {
    throw validationError('Subtasks cannot be nested more than one level deep.', [
      { path: 'parentTaskId', message: 'Choose a top-level task as the parent.' },
    ]);
  }
  return parent;
}

async function assertMilestone(projectId: string, milestoneId: string) {
  const milestone = await prisma.milestone.findFirst({ where: { id: milestoneId, projectId, deletedAt: null } });
  if (!milestone) throw notFound('Milestone not found in this project.');
  return milestone;
}

async function assertLabels(projectId: string, labelIds: string[]) {
  if (labelIds.length === 0) return;
  const unique = [...new Set(labelIds)];
  const labels = await prisma.label.findMany({
    where: { id: { in: unique }, deletedAt: null, OR: [{ projectId }, { projectId: null }] },
    select: { id: true },
  });
  if (labels.length !== unique.length) {
    throw validationError('One or more labels are not available in this project.', [
      { path: 'labelIds', message: 'One or more labels are not available in this project.' },
    ]);
  }
}

export async function hasSubtasks(taskId: string): Promise<boolean> {
  return (await prisma.task.count({ where: { parentTaskId: taskId, deletedAt: null } })) > 0;
}

/** Status side effects: completion timestamp and progress handling. */
export function statusSideEffects(
  current: { category: string; progress: number },
  nextCategory: string,
  hasChildren: boolean,
): { completedAt: Date | null; progress?: number } {
  if (nextCategory === 'DONE') {
    return { completedAt: new Date(), ...(hasChildren ? {} : { progress: 100 }) };
  }
  if (current.category === 'DONE') {
    return {
      completedAt: null,
      // A reopened leaf task is no longer complete; keep it below 100%.
      ...(hasChildren ? {} : { progress: current.progress >= 100 ? 99 : current.progress }),
    };
  }
  return { completedAt: null };
}

export async function getTask(user: User, taskId: string): Promise<TaskDto> {
  const { task } = await loadTaskForPermission(user, taskId, 'task:view');
  const row = await prisma.task.findFirstOrThrow({ where: { id: task.id }, include: taskDetailInclude });

  let displayKey = row.key;
  if (row.parentTaskId) {
    const index = await prisma.task.count({
      where: { parentTaskId: row.parentTaskId, deletedAt: null, number: { lte: row.number } },
    });
    displayKey = `${row.parent?.key ?? row.key}-${index}`;
  }

  const activeSubtasks = row.subtasks.filter((subtask) => subtask.status.category !== 'CANCELLED');
  const counts = {
    subtaskCount: activeSubtasks.length,
    completedSubtaskCount: activeSubtasks.filter((subtask) => subtask.status.category === 'DONE').length,
  };

  const subtaskDtos = row.subtasks.map((subtask, index) =>
    toTaskDto(subtask, { subtaskCount: 0, completedSubtaskCount: 0 }, { displayKey: `${row.key}-${index + 1}` }),
  );

  const dependentRows = await prisma.taskDependency.findMany({
    where: { dependsOnTaskId: row.id },
    include: { task: { select: dependencySelect } },
    orderBy: { createdAt: 'asc' },
  });
  const blocks: DependencyRef[] = dependentRows.map((entry) => toDependencyRef(entry.task));

  return toTaskDto(row, counts, { displayKey, subtasks: subtaskDtos, blocks });
}

export async function createTask(user: User, projectId: string, input: CreateTaskInput): Promise<TaskDto> {
  const access = await assertProjectPermission(user, projectId, 'task:create');
  const project = access.project;

  const [status, priority, type] = await Promise.all([
    resolveStatus(input.statusId),
    resolvePriority(input.priorityId),
    resolveType(input.typeId),
  ]);

  if (input.parentTaskId) await assertParentTask(project.id, input.parentTaskId);
  if (input.milestoneId) await assertMilestone(project.id, input.milestoneId);
  if (input.labelIds) await assertLabels(project.id, input.labelIds);
  if (input.assigneeId) await assertAssignee(input.assigneeId, project.id);

  const lastInColumn = await prisma.task.findFirst({
    where: { projectId: project.id, statusId: status.id, deletedAt: null },
    orderBy: [{ sortOrder: 'desc' }, { number: 'desc' }],
    select: { sortOrder: true },
  });

  const created = await prisma.$transaction(async (tx) => {
    const sequence = await tx.project.update({
      where: { id: project.id },
      data: { taskSequence: { increment: 1 } },
      select: { taskSequence: true, code: true },
    });

    return tx.task.create({
      data: {
        projectId: project.id,
        number: sequence.taskSequence,
        key: `${sequence.code}-${sequence.taskSequence}`,
        title: input.title,
        description: input.description ?? null,
        statusId: status.id,
        priorityId: priority.id,
        typeId: type.id,
        assigneeId: input.assigneeId ?? null,
        reporterId: user.id,
        parentTaskId: input.parentTaskId ?? null,
        milestoneId: input.milestoneId ?? null,
        startDate: input.startDate ? parseDateOnly(input.startDate) : null,
        dueDate: input.dueDate ? parseDateOnly(input.dueDate) : null,
        estimatedHours: input.estimatedHours ?? null,
        actualHours: input.actualHours ?? 0,
        progress: input.progress ?? (status.category === 'DONE' ? 100 : 0),
        nextStep: input.nextStep ?? null,
        verificationNote: input.verificationNote ?? null,
        codeReferences: input.codeReferences ?? [],
        sortOrder: input.sortOrder ?? (lastInColumn ? lastInColumn.sortOrder + 1 : 0),
        labels: input.labelIds?.length
          ? { createMany: { data: [...new Set(input.labelIds)].map((labelId) => ({ labelId })) } }
          : undefined,
      },
      include: taskListInclude,
    });
  });

  await recordActivity({
    projectId: project.id,
    taskId: created.id,
    actor: user,
    action: 'TASK_CREATED',
    metadata: { key: created.key, title: created.title, parentTaskId: created.parentTaskId },
  });
  await recordAudit({
    action: 'TASK_CREATED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'task',
    resourceId: created.id,
    metadata: { projectId: project.id, key: created.key },
  });

  await recalculateProjectProgress(project.id);
  if (input.parentTaskId) await recalculateTaskProgress(input.parentTaskId);

  return getTask(user, created.id);
}

export async function updateTask(user: User, taskId: string, input: UpdateTaskInput): Promise<TaskDto> {
  const { task, access } = await loadTaskForPermission(user, taskId, 'task:update');

  if (input.version !== task.version) {
    throw conflict('This task was updated by someone else. Reload it and try again.');
  }

  const hasChildren = await hasSubtasks(task.id);
  const data: Prisma.TaskUpdateInput = {};
  const changed: string[] = [];
  let action: ActivityAction = 'TASK_UPDATED';
  let field: string | null = null;
  let oldValue: string | null = null;
  let newValue: string | null = null;

  if (input.title !== undefined && input.title !== task.title) {
    data.title = input.title;
    changed.push('title');
  }
  if (input.description !== undefined) {
    data.description = input.description;
    changed.push('description');
  }
  if (input.nextStep !== undefined) {
    data.nextStep = input.nextStep;
    changed.push('nextStep');
  }
  if (input.verificationNote !== undefined) {
    data.verificationNote = input.verificationNote;
    changed.push('verificationNote');
  }
  if (input.codeReferences !== undefined) {
    data.codeReferences = input.codeReferences;
    changed.push('codeReferences');
  }
  if (input.sortOrder !== undefined) {
    data.sortOrder = input.sortOrder;
    changed.push('sortOrder');
  }
  if (input.estimatedHours !== undefined) {
    data.estimatedHours = input.estimatedHours;
    changed.push('estimatedHours');
  }
  if (input.actualHours !== undefined) {
    data.actualHours = input.actualHours;
    changed.push('actualHours');
  }
  if (input.priorityId !== undefined && input.priorityId !== task.priorityId) {
    const priority = await resolvePriority(input.priorityId);
    data.priority = { connect: { id: priority.id } };
    changed.push('priority');
  }
  if (input.typeId !== undefined && input.typeId !== task.typeId) {
    const type = await resolveType(input.typeId);
    data.type = { connect: { id: type.id } };
    changed.push('type');
  }
  if (input.milestoneId !== undefined) {
    if (input.milestoneId === null) {
      data.milestone = { disconnect: true };
      changed.push('milestone');
    } else if (input.milestoneId !== task.milestoneId) {
      await assertMilestone(task.projectId, input.milestoneId);
      data.milestone = { connect: { id: input.milestoneId } };
      changed.push('milestone');
    }
  }
  if (input.assigneeId !== undefined && input.assigneeId !== task.assigneeId) {
    if (input.assigneeId !== user.id && !projectRoleHasPermission(access.role, 'task:assign')) {
      throw forbidden('Assigning tasks to other people requires the task:assign permission.');
    }
    if (input.assigneeId !== null) await assertAssignee(input.assigneeId, task.projectId);
    data.assignee = input.assigneeId ? { connect: { id: input.assigneeId } } : { disconnect: true };
    changed.push('assignee');
    action = 'TASK_ASSIGNED';
    oldValue = task.assigneeId;
    newValue = input.assigneeId;
  }

  // Dates must stay consistent with each other.
  const nextStart = input.startDate !== undefined ? input.startDate : task.startDate?.toISOString().slice(0, 10) ?? null;
  const nextDue = input.dueDate !== undefined ? input.dueDate : task.dueDate?.toISOString().slice(0, 10) ?? null;
  if (nextStart && nextDue && nextDue < nextStart) {
    throw validationError('Due date cannot be before the start date.', [
      { path: 'dueDate', message: 'Due date cannot be before the start date.' },
    ]);
  }
  if (input.startDate !== undefined) {
    data.startDate = input.startDate ? parseDateOnly(input.startDate) : null;
    changed.push('startDate');
  }
  if (input.dueDate !== undefined) {
    data.dueDate = input.dueDate ? parseDateOnly(input.dueDate) : null;
    changed.push('dueDate');
    if (field === null) {
      field = 'dueDate';
      oldValue = task.dueDate?.toISOString().slice(0, 10) ?? null;
      newValue = input.dueDate;
    }
  }

  if (input.progress !== undefined) {
    if (hasChildren) {
      throw validationError('Progress is calculated from subtasks for this task.', [
        { path: 'progress', message: 'Progress is calculated from subtasks.' },
      ]);
    }
    data.progress = input.progress;
    changed.push('progress');
  }

  let statusChanged: { from: string; to: string } | null = null;
  if (input.statusId !== undefined && input.statusId !== task.statusId) {
    const nextStatus = await resolveStatus(input.statusId);
    const currentStatus = await prisma.taskStatus.findUniqueOrThrow({
      where: { id: task.statusId },
      select: { category: true },
    });
    Object.assign(
      data,
      statusSideEffects({ category: currentStatus.category, progress: task.progress }, nextStatus.category, hasChildren),
    );
    // Explicit progress in the same request wins over the status default.
    if (input.progress !== undefined) data.progress = input.progress;
    data.status = { connect: { id: nextStatus.id } };
    changed.push('status');
    action = 'TASK_STATUS_CHANGED';
    field = 'status';
    oldValue = task.statusId;
    newValue = nextStatus.id;
    statusChanged = { from: task.statusId, to: nextStatus.id };
  }

  if (changed.length === 0 && input.labelIds === undefined) {
    return getTask(user, taskId);
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: task.id },
      data: { ...data, version: { increment: 1 } },
    });
    if (input.labelIds !== undefined) {
      await tx.taskLabel.deleteMany({ where: { taskId: task.id } });
      const unique = [...new Set(input.labelIds)];
      if (unique.length > 0) {
        await assertLabels(task.projectId, unique);
        await tx.taskLabel.createMany({ data: unique.map((labelId) => ({ taskId: task.id, labelId })) });
      }
    }
  });

  if (statusChanged) {
    const [previous, next] = await Promise.all([
      prisma.taskStatus.findUnique({ where: { id: statusChanged.from }, select: { name: true } }),
      prisma.taskStatus.findUnique({ where: { id: statusChanged.to }, select: { name: true } }),
    ]);
    await recordActivity({
      projectId: task.projectId,
      taskId: task.id,
      actor: user,
      action: 'TASK_STATUS_CHANGED',
      field: 'status',
      oldValue: previous?.name ?? null,
      newValue: next?.name ?? null,
      metadata: { key: task.key },
    });
    await notifyTaskEvent({
      taskId: task.id,
      actorId: user.id,
      type: 'TASK_STATUS_CHANGED',
      title: `${task.key}: ${previous?.name ?? 'updated'} → ${next?.name ?? 'updated'}`,
      body: task.title,
    });
  } else if (action === 'TASK_ASSIGNED') {
    const assignee = newValue
      ? await prisma.user.findUnique({ where: { id: newValue }, select: { displayName: true } })
      : null;
    await recordActivity({
      projectId: task.projectId,
      taskId: task.id,
      actor: user,
      action: 'TASK_ASSIGNED',
      field: 'assignee',
      newValue: assignee?.displayName ?? 'Unassigned',
      metadata: { key: task.key, assigneeId: newValue },
    });
    if (newValue) {
      await notifyTaskEvent({
        taskId: task.id,
        actorId: user.id,
        type: 'TASK_ASSIGNED',
        title: `You were assigned ${task.key}`,
        body: task.title,
        assigneeOnly: true,
      });
    }
  } else {
    await recordActivity({
      projectId: task.projectId,
      taskId: task.id,
      actor: user,
      action: 'TASK_UPDATED',
      field,
      oldValue,
      newValue,
      metadata: { key: task.key, fields: changed },
    });
  }

  await recordAudit({
    action: 'TASK_UPDATED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'task',
    resourceId: task.id,
    metadata: { projectId: task.projectId, fields: changed },
  });

  await recalculateTaskProgress(task.id);
  await recalculateProjectProgress(task.projectId);

  return getTask(user, taskId);
}

export async function changeTaskStatus(user: User, taskId: string, statusId: string, version: number): Promise<TaskDto> {
  const { task } = await loadTaskForPermission(user, taskId, 'task:update_status');
  if (version !== task.version) {
    throw conflict('This task was updated by someone else. Reload it and try again.');
  }

  const nextStatus = await resolveStatus(statusId);
  const hasChildren = await hasSubtasks(task.id);
  const currentStatus = await prisma.taskStatus.findUniqueOrThrow({
    where: { id: task.statusId },
    select: { name: true, category: true },
  });

  await prisma.task.update({
    where: { id: task.id },
    data: {
      statusId: nextStatus.id,
      version: { increment: 1 },
      ...statusSideEffects({ category: currentStatus.category, progress: task.progress }, nextStatus.category, hasChildren),
    },
  });

  await recordActivity({
    projectId: task.projectId,
    taskId: task.id,
    actor: user,
    action: 'TASK_STATUS_CHANGED',
    field: 'status',
    oldValue: currentStatus.name,
    newValue: nextStatus.name,
    metadata: { key: task.key },
  });
  await recordAudit({
    action: 'TASK_STATUS_CHANGED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'task',
    resourceId: task.id,
    metadata: { projectId: task.projectId, from: currentStatus.name, to: nextStatus.name },
  });
  await notifyTaskEvent({
    taskId: task.id,
    actorId: user.id,
    type: 'TASK_STATUS_CHANGED',
    title: `${task.key}: ${currentStatus.name} → ${nextStatus.name}`,
    body: task.title,
  });

  await recalculateTaskProgress(task.id);
  await recalculateProjectProgress(task.projectId);

  return getTask(user, taskId);
}

export async function assignTask(
  user: User,
  taskId: string,
  assigneeId: string | null,
  version: number,
): Promise<TaskDto> {
  const { task, access } = await loadTaskForPermission(user, taskId, 'task:update');
  if (version !== task.version) {
    throw conflict('This task was updated by someone else. Reload it and try again.');
  }
  if (assigneeId !== user.id && !projectRoleHasPermission(access.role, 'task:assign')) {
    throw forbidden('Assigning tasks to other people requires the task:assign permission.');
  }
  if (assigneeId) await assertAssignee(assigneeId, task.projectId);

  const assignee = assigneeId
    ? await prisma.user.findUniqueOrThrow({ where: { id: assigneeId }, select: { displayName: true } })
    : null;

  await prisma.task.update({
    where: { id: task.id },
    data: { assigneeId, version: { increment: 1 } },
  });

  await recordActivity({
    projectId: task.projectId,
    taskId: task.id,
    actor: user,
    action: 'TASK_ASSIGNED',
    field: 'assignee',
    newValue: assignee?.displayName ?? 'Unassigned',
    metadata: { key: task.key, assigneeId },
  });
  await recordAudit({
    action: 'TASK_ASSIGNED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'task',
    resourceId: task.id,
    metadata: { projectId: task.projectId, assigneeId },
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

  return getTask(user, taskId);
}

export async function createSubtask(user: User, parentTaskId: string, title: string): Promise<TaskDto> {
  const parent = await prisma.task.findFirst({ where: { id: parentTaskId, deletedAt: null } });
  if (!parent) throw notFound('Task not found.');
  await assertProjectPermission(user, parent.projectId, 'task:create');

  const currentStatus = await prisma.taskStatus.findFirstOrThrow({ where: { id: parent.statusId } });

  // A new subtask inherits context from its parent for a smooth workflow.
  return createTask(user, parent.projectId, {
    title,
    parentTaskId: parent.id,
    priorityId: parent.priorityId,
    typeId: parent.typeId,
    milestoneId: parent.milestoneId ?? undefined,
    statusId: await defaultChildStatusId(currentStatus.category),
  });
}

/** New subtasks start in To Do (or the default) regardless of the parent status. */
async function defaultChildStatusId(parentCategory: string): Promise<string | undefined> {
  if (parentCategory === 'DONE' || parentCategory === 'CANCELLED') {
    const status = await prisma.taskStatus.findFirst({
      where: { isActive: true, category: 'TODO' },
      orderBy: { sortOrder: 'asc' },
    });
    return status?.id;
  }
  return undefined;
}

export async function deleteTask(user: User, taskId: string): Promise<void> {
  const { task } = await loadTaskForPermission(user, taskId, 'task:delete');

  const children = await prisma.task.findMany({
    where: { parentTaskId: task.id, deletedAt: null },
    select: { id: true },
  });
  const removedIds = [task.id, ...children.map((child) => child.id)];

  await prisma.$transaction([
    prisma.task.updateMany({
      where: { id: { in: removedIds } },
      data: { deletedAt: new Date() },
    }),
    // A deleted task neither blocks nor is blocked by anything.
    prisma.taskDependency.deleteMany({
      where: { OR: [{ taskId: { in: removedIds } }, { dependsOnTaskId: { in: removedIds } }] },
    }),
  ]);

  await recordActivity({
    projectId: task.projectId,
    taskId: task.id,
    actor: user,
    action: 'TASK_DELETED',
    metadata: { key: task.key, title: task.title },
  });
  await recordAudit({
    action: 'TASK_DELETED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'task',
    resourceId: task.id,
    metadata: { projectId: task.projectId, key: task.key },
  });

  await recalculateProjectProgress(task.projectId);
  if (task.parentTaskId) await recalculateTaskProgress(task.parentTaskId);
}

export async function listTaskActivity(
  user: User,
  taskId: string,
  options: { page: number; pageSize: number },
) {
  const { task } = await loadTaskForPermission(user, taskId, 'task:view');
  const where: Prisma.ActivityLogWhereInput = { taskId: task.id };
  const [items, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
    prisma.activityLog.count({ where }),
  ]);
  return { items, total };
}

export type { TaskWithRelations };
