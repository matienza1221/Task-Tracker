import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/api/axios';
import type { Milestone } from '../projects/types';
import type { Task } from '../tasks/types';

export interface TimelineData {
  project: {
    id: string;
    code: string;
    name: string;
    startDate: string | null;
    targetDate: string | null;
  };
  milestones: Milestone[];
  tasks: Task[];
  truncated: boolean;
}

export const fetchTimeline = (projectId: string) => apiGet<TimelineData>(`/projects/${projectId}/timeline`);

export function useTimeline(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['timeline', projectId] as const,
    queryFn: () => fetchTimeline(projectId),
    enabled: enabled && Boolean(projectId),
  });
}
