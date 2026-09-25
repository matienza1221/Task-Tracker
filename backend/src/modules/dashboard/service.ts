import type { Prisma, User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { accessibleProjectWhere, accessibleTaskWhere } from '../../lib/access';
import { startOfTodayUtc } from '../../lib/validation';
import { countsFromListRow, taskListInclude, toTaskDto, type TaskDto } from '../tasks/dto';
import { projectInclude, toProjectSummary, type ProjectSummaryDto } from '../projects/dto';

export interface DashboardSummary {
  projects: {
    total: number;
    active: number;
    planning: number;
    onHold: number;
    completed: number;
    archived: number;
    overdue: number;
  };
  tasks: {
    total: number;
    backlog: number;
    todo: number;
    inProgress: number;
    inReview: number;
    testing: number;
    blocked: number;
    done: number;
    cancelled: number;
    overdue: number;
    dueToday: number;
    dueThisWeek: number;
    unassigned: number;
    waitingOnDependencies: number;
  };
  myWork: {
    open: number;
    overdue: number;
    dueThisWeek: number;
    recentlyUpdated: TaskDto[];
    recentlyCreated: TaskDto[];
  };
  upcomingMilestones: {
    id: string;
    name: string;
    targetDate: string;
    status: string;
    project: { id: string; code: string; name: string };
  }[];
  recentProjects: ProjectSummaryDto[];
}

function categoryCount(rows: { category: string; _count: { _all: number } }[], category: string): number {
  return rows.find((row) => row.category === category)?._count._all ?? 0;
}

/**
 * Aggregated dashboard for the signed-in user. Every number is scoped in SQL to
 * projects the user can access, so one team's figures never leak into another
 * user's dashboard.
 */
export async function getDashboardSummary(user: User): Promise<DashboardSummary> {
  const startOfToday = startOfTodayUtc();
  const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
  const endOfNextMonth = new Date(startOfToday.getTime() + 30 * 24 * 60 * 60 * 1000);

  const projectScope: Prisma.ProjectWhereInput = { deletedAt: null, AND: [accessibleProjectWhere(user)] };
  const taskScope: Prisma.TaskWhereInput = accessibleTaskWhere(user);
  const openTaskScope: Prisma.TaskWhereInput = {
    ...taskScope,
    status: { category: { notIn: ['DONE', 'CANCELLED'] } },
  };

  const [
    projectsByStatus,
    projectsOverdue,
    taskTotalsByCategory,
    tasksOverdue,
    tasksDueToday,
    tasksDueThisWeek,
    tasksUnassigned,
    tasksWaitingOnDependencies,
    myOpen,
    myOverdue,
    myDueThisWeek,
    myRecentlyUpdated,
    myRecentlyCreated,
    milestones,
    recentProjects,
    memberships,
  ] = await Promise.all([
    prisma.project.groupBy({ by: ['statusId'], where: projectScope, _count: { _all: true } }),
    prisma.project.count({
      where: {
        ...projectScope,
        isArchived: false,
        targetDate: { lt: startOfToday },
        status: { category: { notIn: ['COMPLETED', 'ARCHIVED'] } },
      },
    }),
    prisma.task.groupBy({ by: ['statusId'], where: taskScope, _count: { _all: true } }),
    prisma.task.count({ where: { ...openTaskScope, dueDate: { lt: startOfToday } } }),
    prisma.task.count({ where: { ...openTaskScope, dueDate: startOfToday } }),
    prisma.task.count({ where: { ...openTaskScope, dueDate: { gt: startOfToday, lte: endOfWeek } } }),
    prisma.task.count({ where: { ...openTaskScope, assigneeId: null } }),
    prisma.task.count({
      where: {
        ...openTaskScope,
        dependencies: { some: { dependsOn: { deletedAt: null, status: { category: { notIn: ['DONE', 'CANCELLED'] } } } } },
      },
    }),
    prisma.task.count({ where: { ...openTaskScope, assigneeId: user.id } }),
    prisma.task.count({ where: { ...openTaskScope, assigneeId: user.id, dueDate: { lt: startOfToday } } }),
    prisma.task.count({
      where: { ...openTaskScope, assigneeId: user.id, dueDate: { gt: startOfToday, lte: endOfWeek } },
    }),
    prisma.task.findMany({
      where: { ...taskScope, assigneeId: user.id },
      include: taskListInclude,
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    prisma.task.findMany({
      where: { ...taskScope, reporterId: user.id },
      include: taskListInclude,
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.milestone.findMany({
      where: {
        deletedAt: null,
        targetDate: { gte: startOfToday, lte: endOfNextMonth },
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
        project: projectScope,
      },
      select: {
        id: true,
        name: true,
        targetDate: true,
        status: true,
        project: { select: { id: true, code: true, name: true } },
      },
      orderBy: { targetDate: 'asc' },
      take: 8,
    }),
    prisma.project.findMany({
      where: { ...projectScope, isArchived: false },
      include: projectInclude,
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
    prisma.projectMember.findMany({ where: { userId: user.id }, select: { projectId: true, projectRole: true } }),
  ]);

  const projectStatuses = await prisma.projectStatus.findMany({
    select: { id: true, category: true },
  });
  const statusCategoryById = new Map(projectStatuses.map((status) => [status.id, status.category]));
  const projectsByCategory = projectsByStatus.reduce<Record<string, number>>((accumulator, row) => {
    const category = statusCategoryById.get(row.statusId);
    if (category) accumulator[category] = (accumulator[category] ?? 0) + row._count._all;
    return accumulator;
  }, {});

  const taskStatuses = await prisma.taskStatus.findMany({ select: { id: true, category: true } });
  const taskCategoryById = new Map(taskStatuses.map((status) => [status.id, status.category]));
  const tasksByCategory = taskTotalsByCategory.reduce<{ category: string; _count: { _all: number } }[]>(
    (accumulator, row) => {
      const category = taskCategoryById.get(row.statusId);
      if (category) accumulator.push({ category, _count: row._count });
      return accumulator;
    },
    [],
  );

  const roleByProject = new Map(memberships.map((membership) => [membership.projectId, membership.projectRole]));

  return {
    projects: {
      total: Object.values(projectsByCategory).reduce((sum, value) => sum + value, 0),
      active: projectsByCategory.ACTIVE ?? 0,
      planning: projectsByCategory.PLANNING ?? 0,
      onHold: projectsByCategory.ON_HOLD ?? 0,
      completed: projectsByCategory.COMPLETED ?? 0,
      archived: projectsByCategory.ARCHIVED ?? 0,
      overdue: projectsOverdue,
    },
    tasks: {
      total: tasksByCategory.reduce((sum, row) => sum + row._count._all, 0),
      backlog: categoryCount(tasksByCategory, 'BACKLOG'),
      todo: categoryCount(tasksByCategory, 'TODO'),
      inProgress: categoryCount(tasksByCategory, 'IN_PROGRESS'),
      inReview: categoryCount(tasksByCategory, 'REVIEW'),
      testing: categoryCount(tasksByCategory, 'TESTING'),
      blocked: categoryCount(tasksByCategory, 'BLOCKED'),
      done: categoryCount(tasksByCategory, 'DONE'),
      cancelled: categoryCount(tasksByCategory, 'CANCELLED'),
      overdue: tasksOverdue,
      dueToday: tasksDueToday,
      dueThisWeek: tasksDueThisWeek,
      unassigned: tasksUnassigned,
      waitingOnDependencies: tasksWaitingOnDependencies,
    },
    myWork: {
      open: myOpen,
      overdue: myOverdue,
      dueThisWeek: myDueThisWeek,
      recentlyUpdated: myRecentlyUpdated.map((row) => toTaskDto(row, countsFromListRow(row))),
      recentlyCreated: myRecentlyCreated.map((row) => toTaskDto(row, countsFromListRow(row))),
    },
    upcomingMilestones: milestones.map((milestone) => ({
      id: milestone.id,
      name: milestone.name,
      targetDate: (milestone.targetDate as Date).toISOString().slice(0, 10),
      status: milestone.status,
      project: milestone.project,
    })),
    recentProjects: recentProjects.map((project) =>
      toProjectSummary(project, user.globalRole === 'ADMIN' ? 'ADMIN' : roleByProject.get(project.id) ?? null),
    ),
  };
}
