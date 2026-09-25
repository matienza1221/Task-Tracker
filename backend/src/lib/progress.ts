import type { ProgressWeighting, TaskProgressMode } from '@prisma/client';
import { prisma } from '../db/prisma';

export const DONE_CATEGORY = 'DONE';
export const CANCELLED_CATEGORY = 'CANCELLED';
const PROGRESS_EXCLUDED_CATEGORIES = [DONE_CATEGORY, CANCELLED_CATEGORY];

export interface TaskProgressResult {
  progress: number;
  progressMode: TaskProgressMode;
  subtaskCount: number;
  completedSubtaskCount: number;
}

/**
 * Effective progress for one task (ARCHITECTURE.md decision D7):
 *  - tasks with subtasks: share of non-cancelled subtasks in a DONE status (AUTO)
 *  - leaf tasks: manual progress, forced to 100% while the status is DONE
 *
 * Cancelled subtasks are excluded from the denominator so they cannot block a
 * task from reaching 100%.
 */
export async function computeTaskProgress(taskId: string): Promise<TaskProgressResult | null> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, deletedAt: null },
    select: {
      progress: true,
      status: { select: { category: true } },
      subtasks: { where: { deletedAt: null }, select: { status: { select: { category: true } } } },
    },
  });
  if (!task) return null;

  const activeSubtasks = task.subtasks.filter((subtask) => subtask.status.category !== CANCELLED_CATEGORY);
  const completedSubtasks = activeSubtasks.filter((subtask) => subtask.status.category === DONE_CATEGORY).length;

  if (activeSubtasks.length > 0) {
    return {
      progress: Math.round((completedSubtasks / activeSubtasks.length) * 100),
      progressMode: 'AUTO',
      subtaskCount: activeSubtasks.length,
      completedSubtaskCount: completedSubtasks,
    };
  }

  return {
    progress: task.status.category === DONE_CATEGORY ? 100 : task.progress,
    progressMode: 'MANUAL',
    subtaskCount: task.subtasks.length,
    completedSubtaskCount: completedSubtasks,
  };
}

/**
 * Persists the computed progress for a task and cascades to its parent(s).
 * Subtasks are capped at two levels, so at most one cascade step is needed.
 */
export async function recalculateTaskProgress(taskId: string): Promise<void> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, deletedAt: null },
    select: { id: true, progress: true, progressMode: true, parentTaskId: true },
  });
  if (!task) return;

  const computed = await computeTaskProgress(task.id);
  if (computed && (computed.progress !== task.progress || computed.progressMode !== task.progressMode)) {
    await prisma.task.update({
      where: { id: task.id },
      // Derived values only: the row version is intentionally untouched so
      // automatic recalculation cannot cause spurious optimistic-concurrency
      // conflicts for users editing other fields.
      data: { progress: computed.progress, progressMode: computed.progressMode },
    });
  }

  if (task.parentTaskId) {
    const parent = await prisma.task.findFirst({
      where: { id: task.parentTaskId, deletedAt: null },
      select: { id: true, parentTaskId: true },
    });
    if (parent && !parent.parentTaskId) {
      const parentComputed = await computeTaskProgress(parent.id);
      if (parentComputed) {
        await prisma.task.update({
          where: { id: parent.id },
          data: { progress: parentComputed.progress, progressMode: parentComputed.progressMode },
        });
      }
    }
  }
}

export interface ProjectProgressResult {
  progress: number;
  taskCount: number;
  completedTaskCount: number;
}

/**
 * Project progress over top-level, non-cancelled tasks (subtask progress is
 * already folded into its parent). Weighted by estimated hours when the
 * project uses HOURS weighting and any estimate exists; tasks without an
 * estimate keep a weight of 1 so they cannot vanish from the average.
 */
export async function recalculateProjectProgress(projectId: string): Promise<ProjectProgressResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { progressWeighting: true },
  });
  if (!project) return { progress: 0, taskCount: 0, completedTaskCount: 0 };

  const tasks = await prisma.task.findMany({
    where: {
      projectId,
      deletedAt: null,
      parentTaskId: null,
      status: { category: { not: CANCELLED_CATEGORY } },
    },
    select: { progress: true, estimatedHours: true },
  });

  let progress = 0;
  if (tasks.length > 0) {
    if (project.progressWeighting === 'HOURS') {
      const weighted = tasks.map((task) => {
        const hours = task.estimatedHours ? Number(task.estimatedHours) : 0;
        return { weight: hours > 0 ? hours : 1, progress: task.progress };
      });
      const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
      progress = weighted.reduce((sum, item) => sum + item.weight * item.progress, 0) / totalWeight;
    } else {
      progress = tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length;
    }
  }

  const rounded = Math.round(progress * 100) / 100;
  await prisma.project.update({ where: { id: projectId }, data: { progress: rounded } });

  return {
    progress: rounded,
    taskCount: tasks.length,
    completedTaskCount: tasks.filter((task) => task.progress >= 100).length,
  };
}

export function isOverdue(dueDate: Date | null, statusCategory: string, completedAt: Date | null): boolean {
  if (!dueDate || completedAt) return false;
  if (PROGRESS_EXCLUDED_CATEGORIES.includes(statusCategory)) return false;
  const today = new Date();
  const startOfToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return dueDate.getTime() < startOfToday.getTime();
}
