import type { Task } from '../tasks/types';

export interface CalendarMilestone {
  id: string;
  name: string;
  targetDate: string;
  status: string;
  project: { id: string; code: string; name: string };
}

export interface CalendarProject {
  id: string;
  code: string;
  name: string;
  targetDate: string;
  status: { name: string; color: string; category: string };
}

export interface CalendarData {
  from: string;
  to: string;
  tasks: Task[];
  milestones: CalendarMilestone[];
  projects: CalendarProject[];
  truncated: boolean;
}

export interface CalendarFilters {
  from: string;
  to: string;
  projectId?: string;
  assignee?: string[];
  milestone?: string[];
  label?: string[];
  scope?: 'all' | 'mine';
  includeCompleted?: boolean;
}
