import type { Prisma } from '@prisma/client';

/** Status categories that no longer block dependent work. */
export const UNRESOLVED_CATEGORIES = ['DONE', 'CANCELLED'] as const;

export function isUnresolved(category: string): boolean {
  return !(UNRESOLVED_CATEGORIES as readonly string[]).includes(category);
}

/**
 * Cycle detection for task dependencies (ARCHITECTURE.md §6.3).
 *
 * Adding `taskId depends on dependsOnTaskId` creates a cycle when
 * `dependsOnTaskId` already depends — transitively — on `taskId`. The walk runs
 * as a recursive CTE inside the caller's transaction, so a concurrent insert
 * cannot slip past the check. `UNION` (not `UNION ALL`) also keeps a pre-existing
 * cycle from looping forever.
 */
export async function wouldCreateCycle(
  tx: Prisma.TransactionClient,
  taskId: string,
  dependsOnTaskId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ blocked: number }[]>`
    WITH RECURSIVE chain AS (
      SELECT "task_id", "depends_on_task_id"
      FROM "task_dependencies"
      WHERE "task_id" = ${dependsOnTaskId}::uuid
      UNION
      SELECT d."task_id", d."depends_on_task_id"
      FROM "task_dependencies" d
      JOIN chain c ON d."task_id" = c."depends_on_task_id"
    )
    SELECT 1 AS blocked FROM chain WHERE "depends_on_task_id" = ${taskId}::uuid LIMIT 1
  `;
  return rows.length > 0;
}

export interface DependencyRef {
  id: string;
  key: string;
  title: string;
  status: { name: string; category: string; color: string };
  project: { id: string; code: string };
  dueDate: string | null;
}

export function toDependencyRef(task: {
  id: string;
  key: string;
  title: string;
  dueDate: Date | null;
  status: { name: string; category: string; color: string };
  project: { id: string; code: string };
}): DependencyRef {
  return {
    id: task.id,
    key: task.key,
    title: task.title,
    status: {
      name: task.status.name,
      category: task.status.category,
      color: task.status.color,
    },
    project: { id: task.project.id, code: task.project.code },
    dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
  };
}

/** True when a task is explicitly blocked or waits on incomplete dependencies. */
export function computeIsBlocked(statusCategory: string, blockedBy: DependencyRef[]): boolean {
  if (statusCategory === 'BLOCKED') return true;
  return blockedBy.some((dependency) => isUnresolved(dependency.status.category));
}
