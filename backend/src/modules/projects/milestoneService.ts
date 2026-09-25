import type { Milestone, Prisma, User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { assertProjectPermission } from '../../lib/access';
import { notFound } from '../../lib/errors';
import { startOfTodayUtc } from '../../lib/validation';
import { recordAudit } from '../audit/service';
import { recordActivity } from '../activity/service';
import { parseDateOnly, toDateOnly } from './dto';
import type { CreateMilestoneInput, UpdateMilestoneInput } from './schemas';

export interface MilestoneDto {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  targetDate: string | null;
  status: string;
  completedAt: string | null;
  sortOrder: number;
  /** Derived from the tasks linked to this milestone. */
  taskCount: number;
  completedTaskCount: number;
  overdueTaskCount: number;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface MilestoneStats {
  taskCount: number;
  completedTaskCount: number;
  overdueTaskCount: number;
  progress: number;
}

const EMPTY_STATS: MilestoneStats = { taskCount: 0, completedTaskCount: 0, overdueTaskCount: 0, progress: 0 };

export function toMilestoneDto(milestone: Milestone, stats: MilestoneStats = EMPTY_STATS): MilestoneDto {
  return {
    id: milestone.id,
    projectId: milestone.projectId,
    name: milestone.name,
    description: milestone.description,
    targetDate: toDateOnly(milestone.targetDate),
    status: milestone.status,
    completedAt: milestone.completedAt?.toISOString() ?? null,
    sortOrder: milestone.sortOrder,
    ...stats,
    createdAt: milestone.createdAt.toISOString(),
    updatedAt: milestone.updatedAt.toISOString(),
  };
}

/** Loads a milestone that must belong to the project in the URL (IDOR guard). */
async function findProjectMilestone(projectId: string, milestoneId: string): Promise<Milestone> {
  const milestone = await prisma.milestone.findFirst({ where: { id: milestoneId, projectId, deletedAt: null } });
  if (!milestone) throw notFound('Milestone not found.');
  return milestone;
}

export async function listMilestones(user: User, projectId: string): Promise<MilestoneDto[]> {
  const access = await assertProjectPermission(user, projectId, 'project:view');
  const cancelled = { category: { not: 'CANCELLED' } } as const;
  const linked: Prisma.TaskWhereInput = {
    projectId: access.project.id,
    deletedAt: null,
    milestoneId: { not: null },
    status: cancelled,
  };

  const [milestones, totals, completed, overdue] = await Promise.all([
    prisma.milestone.findMany({
      where: { projectId: access.project.id, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { targetDate: 'asc' }],
    }),
    prisma.task.groupBy({ by: ['milestoneId'], where: linked, _avg: { progress: true }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ['milestoneId'], where: { ...linked, status: { category: 'DONE' } }, _count: { _all: true } }),
    prisma.task.groupBy({
      by: ['milestoneId'],
      where: { ...linked, completedAt: null, dueDate: { lt: startOfTodayUtc() } },
      _count: { _all: true },
    }),
  ]);

  const statsFor = (milestoneId: string): MilestoneStats => {
    const total = totals.find((row) => row.milestoneId === milestoneId);
    return {
      taskCount: total?._count._all ?? 0,
      completedTaskCount: completed.find((row) => row.milestoneId === milestoneId)?._count._all ?? 0,
      overdueTaskCount: overdue.find((row) => row.milestoneId === milestoneId)?._count._all ?? 0,
      progress: total?._avg.progress ? Math.round(Number(total._avg.progress)) : 0,
    };
  };

  return milestones.map((milestone) => toMilestoneDto(milestone, statsFor(milestone.id)));
}

export async function createMilestone(
  user: User,
  projectId: string,
  input: CreateMilestoneInput,
): Promise<MilestoneDto> {
  const access = await assertProjectPermission(user, projectId, 'project:manage_milestones');

  const milestone = await prisma.milestone.create({
    data: {
      projectId: access.project.id,
      name: input.name,
      description: input.description ?? null,
      targetDate: input.targetDate ? parseDateOnly(input.targetDate) : null,
      status: input.status ?? 'PLANNED',
      sortOrder: input.sortOrder ?? 0,
      ...(input.status === 'COMPLETED' ? { completedAt: new Date() } : {}),
    },
  });

  await recordActivity({
    projectId: access.project.id,
    actor: user,
    action: 'MILESTONE_CREATED',
    metadata: { milestoneId: milestone.id, name: milestone.name },
  });
  await recordAudit({
    action: 'MILESTONE_CREATED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'milestone',
    resourceId: milestone.id,
    metadata: { projectId: access.project.id },
  });

  return toMilestoneDto(milestone);
}

export async function updateMilestone(
  user: User,
  projectId: string,
  milestoneId: string,
  input: UpdateMilestoneInput,
): Promise<MilestoneDto> {
  const access = await assertProjectPermission(user, projectId, 'project:manage_milestones');
  const existing = await findProjectMilestone(access.project.id, milestoneId);

  const completedAt =
    input.status === undefined
      ? existing.completedAt
      : input.status === 'COMPLETED'
        ? existing.completedAt ?? new Date()
        : null;

  const milestone = await prisma.milestone.update({
    where: { id: existing.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.targetDate !== undefined
        ? { targetDate: input.targetDate ? parseDateOnly(input.targetDate) : null }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      completedAt,
    },
  });

  const statusChanged = input.status !== undefined && input.status !== existing.status;
  if (statusChanged && input.status === 'COMPLETED') {
    await recordActivity({
      projectId: access.project.id,
      actor: user,
      action: 'MILESTONE_COMPLETED',
      metadata: { milestoneId: milestone.id, name: milestone.name },
    });
  } else {
    await recordActivity({
      projectId: access.project.id,
      actor: user,
      action: 'MILESTONE_UPDATED',
      metadata: { milestoneId: milestone.id, fields: Object.keys(input) },
    });
  }
  await recordAudit({
    action: 'MILESTONE_UPDATED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'milestone',
    resourceId: milestone.id,
    metadata: { projectId: access.project.id, fields: Object.keys(input) },
  });

  return toMilestoneDto(milestone);
}

export async function deleteMilestone(user: User, projectId: string, milestoneId: string): Promise<void> {
  const access = await assertProjectPermission(user, projectId, 'project:manage_milestones');
  const existing = await findProjectMilestone(access.project.id, milestoneId);

  await prisma.milestone.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });

  await recordActivity({
    projectId: access.project.id,
    actor: user,
    action: 'MILESTONE_DELETED',
    metadata: { milestoneId: existing.id, name: existing.name },
  });
  await recordAudit({
    action: 'MILESTONE_DELETED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'milestone',
    resourceId: existing.id,
    metadata: { projectId: access.project.id },
  });
}
