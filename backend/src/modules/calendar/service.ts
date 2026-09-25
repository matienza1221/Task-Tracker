import type { Prisma, User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { accessibleProjectWhere, assertProjectPermission } from '../../lib/access';
import { parseDateOnly } from '../../lib/validation';
import { countsFromListRow, taskListInclude, toTaskDto, type TaskDto } from '../tasks/dto';
import { toDateOnly } from '../projects/dto';
import type { CalendarQuery } from './schemas';

export interface CalendarMilestoneDto {
  id: string;
  name: string;
  targetDate: string;
  status: string;
  project: { id: string; code: string; name: string };
}

export interface CalendarProjectDto {
  id: string;
  code: string;
  name: string;
  targetDate: string;
  status: { name: string; color: string; category: string };
}

export interface CalendarDto {
  from: string;
  to: string;
  tasks: TaskDto[];
  milestones: CalendarMilestoneDto[];
  projects: CalendarProjectDto[];
  truncated: boolean;
}

const TASK_CAP = 500;

/**
 * Calendar feed across every project the caller can access (optionally narrowed
 * to one project). Includes tasks that start or end inside the range,
 * milestone target dates and project target dates.
 */
export async function getCalendar(user: User, query: CalendarQuery): Promise<CalendarDto> {
  const projectFilters: Prisma.ProjectWhereInput[] = [accessibleProjectWhere(user)];

  if (query.projectId) {
    await assertProjectPermission(user, query.projectId, 'task:view');
    projectFilters.push({ id: query.projectId });
  }

  const from = parseDateOnly(query.from);
  const to = parseDateOnly(query.to);
  const scopeWhere: Prisma.ProjectWhereInput = { deletedAt: null, AND: projectFilters };

  const taskFilters: Prisma.TaskWhereInput[] = [
    {
      OR: [
        { dueDate: { gte: from, lte: to } },
        { startDate: { gte: from, lte: to } },
      ],
    },
  ];
  if (query.assignee?.length) taskFilters.push({ assigneeId: { in: query.assignee } });
  if (query.status?.length) taskFilters.push({ status: { key: { in: query.status } } });
  if (query.label?.length) taskFilters.push({ labels: { some: { labelId: { in: query.label } } } });
  if (query.milestone?.length) taskFilters.push({ milestoneId: { in: query.milestone } });
  if (query.scope === 'mine') taskFilters.push({ assigneeId: user.id });
  if (query.includeCompleted === false) taskFilters.push({ status: { category: { notIn: ['DONE', 'CANCELLED'] } } });

  const [tasks, milestones, projects] = await Promise.all([
    prisma.task.findMany({
      where: { deletedAt: null, project: scopeWhere, AND: taskFilters },
      include: taskListInclude,
      orderBy: [{ dueDate: 'asc' }, { number: 'asc' }],
      take: TASK_CAP,
    }),
    prisma.milestone.findMany({
      where: { deletedAt: null, targetDate: { gte: from, lte: to }, project: scopeWhere },
      select: {
        id: true,
        name: true,
        targetDate: true,
        status: true,
        project: { select: { id: true, code: true, name: true } },
      },
      orderBy: { targetDate: 'asc' },
      take: TASK_CAP,
    }),
    prisma.project.findMany({
      where: { ...scopeWhere, targetDate: { gte: from, lte: to } },
      select: {
        id: true,
        code: true,
        name: true,
        targetDate: true,
        status: { select: { name: true, color: true, category: true } },
      },
      orderBy: { targetDate: 'asc' },
      take: TASK_CAP,
    }),
  ]);

  return {
    from: query.from,
    to: query.to,
    tasks: tasks.map((row) => toTaskDto(row, countsFromListRow(row))),
    milestones: milestones.map((milestone) => ({
      id: milestone.id,
      name: milestone.name,
      targetDate: toDateOnly(milestone.targetDate) as string,
      status: milestone.status,
      project: milestone.project,
    })),
    projects: projects.map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      targetDate: toDateOnly(project.targetDate) as string,
      status: project.status,
    })),
    truncated: tasks.length >= TASK_CAP,
  };
}
