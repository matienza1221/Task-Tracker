import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/api/axios';
import type { Project, ProjectPersonDto, ProjectStatusDto } from '../projects/types';
import type { Task } from '../tasks/types';

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
    recentlyUpdated: Task[];
    recentlyCreated: Task[];
  };
  upcomingMilestones: {
    id: string;
    name: string;
    targetDate: string;
    status: string;
    project: { id: string; code: string; name: string };
  }[];
  recentProjects: Project[];
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard', 'summary'] as const,
    queryFn: () => apiGet<DashboardSummary>('/dashboard/summary'),
    staleTime: 60_000,
  });
}

export type { ProjectPersonDto, ProjectStatusDto };
