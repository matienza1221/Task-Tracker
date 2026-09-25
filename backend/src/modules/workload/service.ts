import type { Prisma, User } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { accessibleProjectWhere, accessibleTaskWhere, assertProjectPermission } from '../../lib/access';
import { startOfTodayUtc } from '../../lib/validation';

export const workloadQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  includeCompleted: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export interface WorkloadRow {
  user: { id: string; displayName: string; email: string; avatarUrl: string | null; globalRole: string };
  activeTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  overdueTasks: number;
  completedTasks: number;
  estimatedHours: number;
  actualHours: number;
  /** Rough load indicator: open tasks weighted by remaining estimate. */
  loadScore: number;
  loadLevel: 'low' | 'medium' | 'high';
}

export interface WorkloadSummary {
  rows: WorkloadRow[];
  unassigned: { activeTasks: number; overdueTasks: number; estimatedHours: number };
  totals: { activeTasks: number; overdueTasks: number; completedTasks: number; estimatedHours: number; actualHours: number };
  projectId: string | null;
}

const groupCount = (rows: { assigneeId: string | null; _count: { _all: number } }[]) =>
  new Map(rows.filter((row) => row.assigneeId).map((row) => [row.assigneeId as string, row._count._all]));

/**
 * Team workload across every project the caller can access (or one project).
 * All aggregates are scoped in SQL so a manager never sees another team's load.
 */
export async function getWorkload(user: User, options: { projectId?: string; includeCompleted?: boolean }): Promise<WorkloadSummary> {
  const scope: Prisma.TaskWhereInput = accessibleTaskWhere(user);
  if (options.projectId) {
    await assertProjectPermission(user, options.projectId, 'workload:view');
    scope.projectId = options.projectId;
  }

  const startOfToday = startOfTodayUtc();
  const notDone: Prisma.TaskStatusWhereInput = { category: { notIn: ['DONE', 'CANCELLED'] } };

  const [active, inProgress, blocked, overdue, completed, hours, unassigned] = await Promise.all([
    prisma.task.groupBy({ by: ['assigneeId'], where: { ...scope, status: notDone }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ['assigneeId'], where: { ...scope, status: { category: 'IN_PROGRESS' } }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ['assigneeId'], where: { ...scope, status: { category: 'BLOCKED' } }, _count: { _all: true } }),
    prisma.task.groupBy({
      by: ['assigneeId'],
      where: { ...scope, status: notDone, completedAt: null, dueDate: { lt: startOfToday } },
      _count: { _all: true },
    }),
    prisma.task.groupBy({ by: ['assigneeId'], where: { ...scope, status: { category: 'DONE' } }, _count: { _all: true } }),
    prisma.task.groupBy({
      by: ['assigneeId'],
      where: { ...scope, status: notDone },
      _sum: { estimatedHours: true, actualHours: true },
      _count: { _all: true },
    }),
    prisma.task.findMany({
      where: { ...scope, status: notDone, assigneeId: null },
      select: { dueDate: true, estimatedHours: true },
    }),
  ]);

  const activeByUser = groupCount(active);
  const inProgressByUser = groupCount(inProgress);
  const blockedByUser = groupCount(blocked);
  const overdueByUser = groupCount(overdue);
  const completedByUser = groupCount(completed);
  const hoursByUser = new Map(
    hours
      .filter((row) => row.assigneeId)
      .map((row) => [
        row.assigneeId as string,
        { estimated: Number(row._sum.estimatedHours ?? 0), actual: Number(row._sum.actualHours ?? 0) },
      ]),
  );

  const userIds = [...activeByUser.keys(), ...completedByUser.keys()];
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(userIds)] }, deletedAt: null },
    select: { id: true, displayName: true, email: true, avatarUrl: true, globalRole: true },
  });

  const rows: WorkloadRow[] = users
    .map((member) => {
      const estimatedHours = hoursByUser.get(member.id)?.estimated ?? 0;
      const actualHours = hoursByUser.get(member.id)?.actual ?? 0;
      const activeTasks = activeByUser.get(member.id) ?? 0;
      // Remaining work: estimate minus hours already logged, floored at the task count.
      const remainingHours = Math.max(estimatedHours - actualHours, activeTasks);
      const loadScore = Math.round((remainingHours + (overdueByUser.get(member.id) ?? 0) * 4) * 10) / 10;
      const loadLevel: WorkloadRow['loadLevel'] = loadScore >= 40 ? 'high' : loadScore >= 16 ? 'medium' : 'low';
      return {
        user: member,
        activeTasks,
        inProgressTasks: inProgressByUser.get(member.id) ?? 0,
        blockedTasks: blockedByUser.get(member.id) ?? 0,
        overdueTasks: overdueByUser.get(member.id) ?? 0,
        completedTasks: completedByUser.get(member.id) ?? 0,
        estimatedHours,
        actualHours,
        loadScore,
        loadLevel,
      };
    })
    .filter((row) => row.activeTasks > 0 || row.completedTasks > 0 || (options.includeCompleted ?? false))
    .sort((a, b) => b.loadScore - a.loadScore);

  return {
    rows,
    unassigned: {
      activeTasks: unassigned.length,
      overdueTasks: unassigned.filter((task) => task.dueDate && task.dueDate < startOfToday).length,
      estimatedHours: unassigned.reduce((sum, task) => sum + Number(task.estimatedHours ?? 0), 0),
    },
    totals: {
      activeTasks: rows.reduce((sum, row) => sum + row.activeTasks, 0),
      overdueTasks: rows.reduce((sum, row) => sum + row.overdueTasks, 0),
      completedTasks: rows.reduce((sum, row) => sum + row.completedTasks, 0),
      estimatedHours: rows.reduce((sum, row) => sum + row.estimatedHours, 0),
      actualHours: rows.reduce((sum, row) => sum + row.actualHours, 0),
    },
    projectId: options.projectId ?? null,
  };
}

export function accessibleProjectFilter(user: User) {
  return accessibleProjectWhere(user);
}
