import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/api/axios';
import { toQueryString } from '../../lib/api/queryString';

export interface WorkloadRow {
  user: { id: string; displayName: string; email: string; avatarUrl: string | null; globalRole: string };
  activeTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  overdueTasks: number;
  completedTasks: number;
  estimatedHours: number;
  actualHours: number;
  loadScore: number;
  loadLevel: 'low' | 'medium' | 'high';
}

export interface WorkloadSummary {
  rows: WorkloadRow[];
  unassigned: { activeTasks: number; overdueTasks: number; estimatedHours: number };
  totals: { activeTasks: number; overdueTasks: number; completedTasks: number; estimatedHours: number; actualHours: number };
  projectId: string | null;
}

export function useWorkload(filters: { projectId?: string; includeCompleted?: boolean } = {}) {
  return useQuery({
    queryKey: ['team', 'workload', filters] as const,
    queryFn: () => apiGet<WorkloadSummary>(`/team/workload${toQueryString({ ...filters })}`),
    placeholderData: (previous) => previous,
  });
}
