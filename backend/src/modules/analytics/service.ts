import type { User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { assertProjectPermission } from '../../lib/access';
import { startOfTodayUtc } from '../../lib/validation';
import { toDateOnly } from '../projects/dto';

const TASK_CAP = 5000;
const UNRESOLVED = ['DONE', 'CANCELLED'];

export interface DistributionRow {
  id: string;
  key: string;
  name: string;
  category?: string;
  color: string;
  count: number;
}

export interface TrendPoint {
  date: string;
  count: number;
}

export interface BurndownPoint {
  date: string;
  remaining: number;
  ideal: number;
}

export interface VelocityPoint {
  weekStart: string;
  completed: number;
}

export interface AssigneeRow {
  user: { id: string; displayName: string; avatarUrl: string | null } | null;
  open: number;
  done: number;
  overdue: number;
  estimatedHours: number;
  actualHours: number;
}

export interface ProjectAnalytics {
  project: {
    id: string;
    code: string;
    name: string;
    progress: number;
    startDate: string | null;
    targetDate: string | null;
    status: { name: string; color: string; category: string };
  };
  completion: {
    total: number;
    done: number;
    open: number;
    cancelled: number;
    overdue: number;
    blocked: number;
    unassigned: number;
    donePercent: number;
  };
  byStatus: DistributionRow[];
  byPriority: DistributionRow[];
  byType: DistributionRow[];
  byAssignee: AssigneeRow[];
  createdTrend: TrendPoint[];
  completedTrend: TrendPoint[];
  burndown: BurndownPoint[];
  velocity: VelocityPoint[];
  cycleTime: { averageDays: number | null; sampleSize: number };
  windowDays: number;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function weekStart(date: Date): Date {
  const day = date.getUTCDay();
  const diff = (day + 6) % 7; // Monday as the first day
  return startOfDayUtc(addDays(date, -diff));
}

/**
 * Project analytics: distributions, trends, burndown, velocity and cycle time.
 * Task rows are loaded once (capped) and aggregated in memory, which keeps the
 * SQL simple and predictable for the project sizes this tool targets.
 */
export async function getProjectAnalytics(user: User, projectId: string, windowDays: number): Promise<ProjectAnalytics> {
  const access = await assertProjectPermission(user, projectId, 'report:view');
  const project = access.project;

  const [tasks, statuses, priorities, types, projectStatus] = await Promise.all([
    prisma.task.findMany({
      where: { projectId: project.id, deletedAt: null, parentTaskId: null },
      select: {
        id: true,
        statusId: true,
        priorityId: true,
        typeId: true,
        assigneeId: true,
        createdAt: true,
        completedAt: true,
        dueDate: true,
        estimatedHours: true,
        actualHours: true,
        status: { select: { category: true } },
        assignee: { select: { id: true, displayName: true, avatarUrl: true } },
        dependencies: {
          where: { dependsOn: { deletedAt: null, status: { category: { notIn: ['DONE', 'CANCELLED'] } } } },
          select: { id: true },
        },
      },
      orderBy: { number: 'asc' },
      take: TASK_CAP,
    }),
    prisma.taskStatus.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.taskPriority.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.taskType.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.projectStatus.findUnique({ where: { id: project.statusId } }),
  ]);

  const startOfToday = startOfTodayUtc();
  const windowStart = startOfDayUtc(addDays(startOfToday, -(windowDays - 1)));

  const nonCancelled = tasks.filter((task) => task.status.category !== 'CANCELLED');
  const done = tasks.filter((task) => task.status.category === 'DONE');
  const open = nonCancelled.filter((task) => !UNRESOLVED.includes(task.status.category));
  const overdue = open.filter((task) => task.dueDate && task.dueDate < startOfToday);
  const blocked = open.filter(
    (task) => task.status.category === 'BLOCKED' || task.dependencies.length > 0,
  );

  const countBy = <T extends string>(rows: { [key: string]: unknown }[], field: T, key: string) => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const value = row[field] as string | null;
      if (!value) continue;
      map.set(value, (map.get(value) ?? 0) + 1);
    }
    return map.get(key) ?? 0;
  };

  const byStatus: DistributionRow[] = statuses
    .map((status) => ({
      id: status.id,
      key: status.key,
      name: status.name,
      category: status.category,
      color: status.color,
      count: countBy(tasks, 'statusId', status.id),
    }))
    .filter((row) => row.count > 0);

  const byPriority: DistributionRow[] = priorities
    .map((priority) => ({
      id: priority.id,
      key: priority.key,
      name: priority.name,
      color: priority.color,
      count: countBy(tasks, 'priorityId', priority.id),
    }))
    .filter((row) => row.count > 0);

  const byType: DistributionRow[] = types
    .map((type) => ({
      id: type.id,
      key: type.key,
      name: type.name,
      color: type.color,
      count: countBy(tasks, 'typeId', type.id),
    }))
    .filter((row) => row.count > 0);

  // Per-assignee workload inside this project.
  const assigneeIds = [...new Set(nonCancelled.map((task) => task.assigneeId).filter((id): id is string => Boolean(id)))];
  const assigneeRows: AssigneeRow[] = assigneeIds
    .map((assigneeId) => {
      const mine = nonCancelled.filter((task) => task.assigneeId === assigneeId);
      const mineDone = mine.filter((task) => task.status.category === 'DONE');
      const mineOpen = mine.filter((task) => !UNRESOLVED.includes(task.status.category));
      return {
        user: mine[0].assignee,
        open: mineOpen.length,
        done: mineDone.length,
        overdue: mineOpen.filter((task) => task.dueDate && task.dueDate < startOfToday).length,
        estimatedHours: mine.reduce((sum, task) => sum + Number(task.estimatedHours ?? 0), 0),
        actualHours: mine.reduce((sum, task) => sum + Number(task.actualHours ?? 0), 0),
      };
    })
    .sort((a, b) => b.open - a.open);

  const unassignedCount = open.filter((task) => !task.assigneeId).length;
  if (unassignedCount > 0) {
    const mine = nonCancelled.filter((task) => !task.assigneeId);
    assigneeRows.push({
      user: null,
      open: mine.filter((task) => !UNRESOLVED.includes(task.status.category)).length,
      done: mine.filter((task) => task.status.category === 'DONE').length,
      overdue: mine.filter((task) => task.dueDate && task.dueDate < startOfToday && !UNRESOLVED.includes(task.status.category)).length,
      estimatedHours: mine.reduce((sum, task) => sum + Number(task.estimatedHours ?? 0), 0),
      actualHours: mine.reduce((sum, task) => sum + Number(task.actualHours ?? 0), 0),
    });
  }

  // Trends inside the requested window.
  const createdTrend: TrendPoint[] = [];
  const completedTrend: TrendPoint[] = [];
  for (let offset = 0; offset < windowDays; offset += 1) {
    const day = addDays(windowStart, offset);
    const key = dayKey(day);
    createdTrend.push({ date: key, count: tasks.filter((task) => dayKey(task.createdAt) === key).length });
    completedTrend.push({
      date: key,
      count: tasks.filter((task) => task.completedAt && dayKey(task.completedAt) === key).length,
    });
  }

  // Burndown over the project window (falling back to the analytics window).
  const burndownStart = project.startDate && project.targetDate ? startOfDayUtc(project.startDate) : windowStart;
  const burndownEnd = project.startDate && project.targetDate ? startOfDayUtc(project.targetDate) : startOfToday;
  const spanDays = Math.max(Math.min(Math.round((burndownEnd.getTime() - burndownStart.getTime()) / 86_400_000) + 1, 180), 7);
  const burndown: BurndownPoint[] = [];
  const initialTotal = nonCancelled.filter((task) => task.createdAt <= burndownEnd).length;
  for (let offset = 0; offset < spanDays; offset += 1) {
    const day = addDays(burndownStart, offset);
    const dayEnd = addDays(day, 1);
    const remaining = nonCancelled.filter((task) => {
      if (task.createdAt >= dayEnd) return false;
      // Imported rows can be DONE without a completion timestamp; treat them as
      // completed when they were created.
      const completedAt = task.completedAt ?? (task.status.category === 'DONE' ? task.createdAt : null);
      return !completedAt || completedAt >= dayEnd;
    }).length;
    burndown.push({
      date: dayKey(day),
      remaining,
      ideal: Math.max(Math.round(((spanDays - offset) / spanDays) * initialTotal), 0),
    });
  }

  // Velocity: completions per ISO week for the last 8 weeks.
  const velocity: VelocityPoint[] = [];
  for (let offset = 7; offset >= 0; offset -= 1) {
    const start = weekStart(addDays(startOfToday, -offset * 7));
    const end = addDays(start, 7);
    velocity.push({
      weekStart: dayKey(start),
      completed: done.filter((task) => task.completedAt && task.completedAt >= start && task.completedAt < end).length,
    });
  }

  const cycleSamples = done
    .filter((task) => task.completedAt)
    .slice(-500)
    .map((task) => (task.completedAt!.getTime() - task.createdAt.getTime()) / 86_400_000);

  return {
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
      progress: Number(project.progress),
      startDate: toDateOnly(project.startDate),
      targetDate: toDateOnly(project.targetDate),
      status: {
        name: projectStatus?.name ?? 'Unknown',
        color: projectStatus?.color ?? '#64748b',
        category: projectStatus?.category ?? 'PLANNING',
      },
    },
    completion: {
      total: tasks.length,
      done: done.length,
      open: open.length,
      cancelled: tasks.length - nonCancelled.length,
      overdue: overdue.length,
      blocked: blocked.length,
      unassigned: unassignedCount,
      donePercent: nonCancelled.length > 0 ? Math.round((done.length / nonCancelled.length) * 100) : 0,
    },
    byStatus,
    byPriority,
    byType,
    byAssignee: assigneeRows,
    createdTrend,
    completedTrend,
    burndown,
    velocity,
    cycleTime: {
      averageDays: cycleSamples.length > 0 ? Math.round((cycleSamples.reduce((a, b) => a + b, 0) / cycleSamples.length) * 10) / 10 : null,
      sampleSize: cycleSamples.length,
    },
    windowDays,
  };
}
