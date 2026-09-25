import type { User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { assertProjectPermission } from '../../lib/access';
import { countsFromListRow, taskListInclude, toTaskDto, type TaskDto } from '../tasks/dto';
import { toDateOnly } from '../projects/dto';
import type { MilestoneDto } from '../projects/milestoneService';
import { toMilestoneDto } from '../projects/milestoneService';

export interface TimelineDto {
  project: {
    id: string;
    code: string;
    name: string;
    startDate: string | null;
    targetDate: string | null;
  };
  milestones: MilestoneDto[];
  tasks: TaskDto[];
  truncated: boolean;
}

const TIMELINE_CAP = 500;

/**
 * Gantt-style feed for one project: top-level, non-cancelled tasks with their
 * dates (tasks without dates are returned too so the UI can show them as
 * unscheduled) plus milestones for marker rendering.
 */
export async function getTimeline(user: User, projectId: string): Promise<TimelineDto> {
  const access = await assertProjectPermission(user, projectId, 'task:view');

  const [tasks, milestones] = await Promise.all([
    prisma.task.findMany({
      where: {
        projectId: access.project.id,
        deletedAt: null,
        parentTaskId: null,
        status: { category: { not: 'CANCELLED' } },
      },
      include: taskListInclude,
      orderBy: [{ startDate: 'asc' }, { dueDate: 'asc' }, { number: 'asc' }],
      take: TIMELINE_CAP,
    }),
    prisma.milestone.findMany({
      where: { projectId: access.project.id, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { targetDate: 'asc' }],
    }),
  ]);

  return {
    project: {
      id: access.project.id,
      code: access.project.code,
      name: access.project.name,
      startDate: toDateOnly(access.project.startDate),
      targetDate: toDateOnly(access.project.targetDate),
    },
    milestones: milestones.map((milestone) => toMilestoneDto(milestone)),
    tasks: tasks.map((row) => toTaskDto(row, countsFromListRow(row))),
    truncated: tasks.length >= TIMELINE_CAP,
  };
}
