import type { Prisma } from '@prisma/client';
import { computeIsBlocked, toDependencyRef, type DependencyRef } from '../../lib/dependencies';
import { isOverdue } from '../../lib/progress';
import { toDateOnly } from '../projects/dto';

const personSelect = { select: { id: true, displayName: true, email: true, avatarUrl: true } } as const;

export const taskBaseInclude = {
  status: true,
  priority: true,
  type: true,
  assignee: personSelect,
  reporter: personSelect,
  parent: { select: { id: true, key: true, title: true } },
  milestone: { select: { id: true, name: true, status: true, targetDate: true } },
  project: { select: { id: true, code: true, name: true } },
  labels: { select: { label: { select: { id: true, name: true, color: true } } } },
  dependencies: {
    where: { dependsOn: { deletedAt: null } },
    select: {
      dependsOn: {
        select: {
          id: true,
          key: true,
          title: true,
          dueDate: true,
          status: { select: { name: true, category: true, color: true } },
          project: { select: { id: true, code: true } },
        },
      },
    },
  },
} satisfies Prisma.TaskInclude;

/** List rows include only the subtask status categories needed for counting. */
export const taskListInclude = {
  ...taskBaseInclude,
  subtasks: { where: { deletedAt: null }, select: { status: { select: { category: true } } } },
} satisfies Prisma.TaskInclude;

export const taskDetailInclude = {
  ...taskBaseInclude,
  subtasks: { where: { deletedAt: null }, include: taskBaseInclude, orderBy: { number: 'asc' as const } },
} satisfies Prisma.TaskInclude;

export type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskBaseInclude }>;
export type TaskWithSubtasks = Prisma.TaskGetPayload<{ include: typeof taskDetailInclude }>;
export type TaskListRow = Prisma.TaskGetPayload<{ include: typeof taskListInclude }>;

export interface TaskPersonDto {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

export interface TaskDto {
  id: string;
  key: string;
  /** Presentational alias for subtasks: `WEBAPP-3-1`. */
  displayKey: string;
  number: number;
  title: string;
  description: string | null;
  project: { id: string; code: string; name: string };
  parent: { id: string; key: string; title: string } | null;
  milestone: { id: string; name: string; status: string; targetDate: string | null } | null;
  status: { id: string; key: string; name: string; category: string; color: string };
  priority: { id: string; key: string; name: string; weight: number; color: string };
  type: { id: string; key: string; name: string; icon: string; color: string };
  assignee: TaskPersonDto | null;
  reporter: TaskPersonDto | null;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  estimatedHours: number | null;
  actualHours: number;
  progress: number;
  progressMode: string;
  nextStep: string | null;
  verificationNote: string | null;
  codeReferences: string[];
  labels: { id: string; name: string; color: string }[];
  /** Tasks that must finish before this one can proceed. */
  blockedBy: DependencyRef[];
  /** Tasks waiting on this one (detail view only). */
  blocks?: DependencyRef[];
  isBlocked: boolean;
  subtaskCount: number;
  completedSubtaskCount: number;
  isOverdue: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  subtasks?: TaskDto[];
}

const toNullableNumber = (value: Prisma.Decimal | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);

export function toTaskDto(
  task: TaskWithRelations,
  counts: { subtaskCount: number; completedSubtaskCount: number },
  options: { displayKey?: string; subtasks?: TaskDto[]; blocks?: DependencyRef[] } = {},
): TaskDto {
  const dto: TaskDto = {
    id: task.id,
    key: task.key,
    displayKey: options.displayKey ?? task.key,
    number: task.number,
    title: task.title,
    description: task.description,
    project: task.project,
    parent: task.parent,
    milestone: task.milestone
      ? {
          id: task.milestone.id,
          name: task.milestone.name,
          status: task.milestone.status,
          targetDate: toDateOnly(task.milestone.targetDate),
        }
      : null,
    status: {
      id: task.status.id,
      key: task.status.key,
      name: task.status.name,
      category: task.status.category,
      color: task.status.color,
    },
    priority: {
      id: task.priority.id,
      key: task.priority.key,
      name: task.priority.name,
      weight: task.priority.weight,
      color: task.priority.color,
    },
    type: { id: task.type.id, key: task.type.key, name: task.type.name, icon: task.type.icon, color: task.type.color },
    assignee: task.assignee,
    reporter: task.reporter,
    startDate: toDateOnly(task.startDate),
    dueDate: toDateOnly(task.dueDate),
    completedAt: task.completedAt?.toISOString() ?? null,
    estimatedHours: toNullableNumber(task.estimatedHours),
    actualHours: Number(task.actualHours),
    progress: task.progress,
    progressMode: task.progressMode,
    nextStep: task.nextStep,
    verificationNote: task.verificationNote,
    codeReferences: task.codeReferences,
    labels: task.labels.map((entry) => entry.label),
    blockedBy: task.dependencies.map((entry) => toDependencyRef(entry.dependsOn)),
    isBlocked: false,
    subtaskCount: counts.subtaskCount,
    completedSubtaskCount: counts.completedSubtaskCount,
    isOverdue: isOverdue(task.dueDate, task.status.category, task.completedAt),
    version: task.version,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
  dto.isBlocked = computeIsBlocked(task.status.category, dto.blockedBy);
  if (options.subtasks) dto.subtasks = options.subtasks;
  if (options.blocks) dto.blocks = options.blocks;
  return dto;
}

export function countsFromListRow(row: TaskListRow): { subtaskCount: number; completedSubtaskCount: number } {
  const active = row.subtasks.filter((subtask) => subtask.status.category !== 'CANCELLED');
  return {
    subtaskCount: active.length,
    completedSubtaskCount: active.filter((subtask) => subtask.status.category === 'DONE').length,
  };
}
