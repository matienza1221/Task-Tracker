import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/api/axios';
import { toQueryString } from '../../lib/api/queryString';

export interface DistributionRow {
  id: string;
  key: string;
  name: string;
  category?: string;
  color: string;
  count: number;
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
  createdTrend: { date: string; count: number }[];
  completedTrend: { date: string; count: number }[];
  burndown: { date: string; remaining: number; ideal: number }[];
  velocity: { weekStart: string; completed: number }[];
  cycleTime: { averageDays: number | null; sampleSize: number };
  windowDays: number;
}

export function useProjectAnalytics(projectId: string | undefined, days = 30) {
  return useQuery({
    queryKey: ['analytics', projectId, days] as const,
    queryFn: () => apiGet<ProjectAnalytics>(`/projects/${projectId}/analytics${toQueryString({ days })}`),
    enabled: Boolean(projectId),
    placeholderData: (previous) => previous,
  });
}
