import type { User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { accessibleProjectWhere } from '../../lib/access';
import { taskListInclude, toTaskDto, type TaskDto } from '../tasks/dto';
import { projectInclude, toProjectSummary, type ProjectSummaryDto } from '../projects/dto';

export interface SearchResults {
  tasks: TaskDto[];
  projects: ProjectSummaryDto[];
}

/**
 * Global search for the command palette. Results are scoped in SQL to projects
 * the caller can access — never fetched-then-filtered.
 */
export async function searchAll(user: User, query: string, limit: number): Promise<SearchResults> {
  const projectScope = { deletedAt: null, AND: [accessibleProjectWhere(user)] };

  const [tasks, projects, memberships] = await Promise.all([
    prisma.task.findMany({
      where: {
        deletedAt: null,
        project: projectScope,
        OR: [
          { key: { equals: query.toUpperCase() } },
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: taskListInclude,
      orderBy: { updatedAt: 'desc' },
      take: limit,
    }),
    prisma.project.findMany({
      where: {
        deletedAt: null,
        AND: [
          accessibleProjectWhere(user),
          {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { code: { contains: query, mode: 'insensitive' } },
            ],
          },
        ],
      },
      include: projectInclude,
      orderBy: { updatedAt: 'desc' },
      take: limit,
    }),
    prisma.projectMember.findMany({ where: { userId: user.id }, select: { projectId: true, projectRole: true } }),
  ]);

  const roleByProject = new Map(memberships.map((membership) => [membership.projectId, membership.projectRole]));

  return {
    tasks: tasks.map((task) => {
      const active = task.subtasks.filter((subtask) => subtask.status.category !== 'CANCELLED');
      return toTaskDto(task, {
        subtaskCount: active.length,
        completedSubtaskCount: active.filter((subtask) => subtask.status.category === 'DONE').length,
      });
    }),
    projects: projects.map((project) =>
      toProjectSummary(project, user.globalRole === 'ADMIN' ? 'ADMIN' : roleByProject.get(project.id) ?? null),
    ),
  };
}
