import type { Prisma } from '@prisma/client';
import type { EffectiveProjectRole } from '../../lib/access';

export const projectInclude = {
  status: true,
  priority: true,
  manager: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
  createdBy: { select: { id: true, displayName: true } },
  _count: { select: { members: true, milestones: true, labels: true } },
} satisfies Prisma.ProjectInclude;

export type ProjectWithRelations = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

export interface StatusDto {
  id: string;
  key: string;
  name: string;
  category: string;
  color: string;
}

export interface PriorityDto {
  id: string;
  key: string;
  name: string;
  weight: number;
  color: string;
}

export interface ProjectSummaryDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: StatusDto;
  priority: PriorityDto;
  startDate: string | null;
  targetDate: string | null;
  actualCompletionDate: string | null;
  manager: { id: string; displayName: string; email: string; avatarUrl: string | null } | null;
  createdBy: { id: string; displayName: string } | null;
  progress: number;
  progressWeighting: string;
  isArchived: boolean;
  archivedAt: string | null;
  myRole: EffectiveProjectRole | null;
  memberCount: number;
  milestoneCount: number;
  labelCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Date-only columns are returned as `YYYY-MM-DD` so clients never shift dates across timezones. */
export function toDateOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toProjectSummary(project: ProjectWithRelations, myRole: EffectiveProjectRole | null): ProjectSummaryDto {
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    description: project.description,
    status: {
      id: project.status.id,
      key: project.status.key,
      name: project.status.name,
      category: project.status.category,
      color: project.status.color,
    },
    priority: {
      id: project.priority.id,
      key: project.priority.key,
      name: project.priority.name,
      weight: project.priority.weight,
      color: project.priority.color,
    },
    startDate: toDateOnly(project.startDate),
    targetDate: toDateOnly(project.targetDate),
    actualCompletionDate: toDateOnly(project.actualCompletionDate),
    manager: project.manager,
    createdBy: project.createdBy,
    progress: Number(project.progress),
    progressWeighting: project.progressWeighting,
    isArchived: project.isArchived,
    archivedAt: project.archivedAt?.toISOString() ?? null,
    myRole,
    memberCount: project._count.members,
    milestoneCount: project._count.milestones,
    labelCount: project._count.labels,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}
