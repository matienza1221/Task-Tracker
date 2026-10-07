import type { DependencyRef } from '../dependencies/types';

export interface TaskStatusRef {
  id: string;
  key: string;
  name: string;
  category: string;
  color: string;
}

export interface TaskPriorityRef {
  id: string;
  key: string;
  name: string;
  weight: number;
  color: string;
}

export interface TaskTypeRef {
  id: string;
  key: string;
  name: string;
  icon: string;
  color: string;
}

export interface TaskPerson {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

export interface TaskMilestoneRef {
  id: string;
  name: string;
  status: string;
  targetDate: string | null;
}

export interface TaskLabelRef {
  id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  key: string;
  displayKey: string;
  number: number;
  title: string;
  description: string | null;
  project: { id: string; code: string; name: string };
  parent: { id: string; key: string; title: string } | null;
  milestone: TaskMilestoneRef | null;
  status: TaskStatusRef;
  priority: TaskPriorityRef;
  type: TaskTypeRef;
  assignee: TaskPerson | null;
  reporter: TaskPerson | null;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  estimatedHours: number | null;
  actualHours: number;
  progress: number;
  progressMode: 'AUTO' | 'MANUAL';
  nextStep: string | null;
  verificationNote: string | null;
  codeReferences: string[];
  labels: TaskLabelRef[];
  /** Tasks that must finish before this one can proceed. */
  blockedBy: DependencyRef[];
  /** Tasks waiting on this one (task detail only). */
  blocks?: DependencyRef[];
  isBlocked: boolean;
  subtaskCount: number;
  completedSubtaskCount: number;
  isOverdue: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  subtasks?: Task[];
}

export interface TaskFilters {
  q?: string;
  status?: string[];
  priority?: string[];
  type?: string[];
  assignee?: string[];
  label?: string[];
  milestone?: string[];
  projectId?: string;
  scope?: 'all' | 'mine' | 'unassigned';
  subtasks?: 'top' | 'all' | 'only';
  overdue?: boolean;
  blocked?: boolean;
  includeCompleted?: boolean;
  dueFrom?: string;
  dueTo?: string;
  progressMin?: number;
  progressMax?: number;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface BoardColumn {
  status: TaskStatusRef;
  tasks: Task[];
}

export interface BoardFilters {
  q?: string;
  priority?: string[];
  assignee?: string[];
  label?: string[];
  milestone?: string[];
  scope?: 'all' | 'mine' | 'unassigned';
  blocked?: boolean;
  includeCancelled?: boolean;
}

export interface TaskFormInput {
  title: string;
  description?: string;
  statusId?: string;
  priorityId?: string;
  typeId?: string;
  assigneeId?: string | null;
  milestoneId?: string | null;
  startDate?: string;
  dueDate?: string;
  estimatedHours?: number | null;
  actualHours?: number;
  progress?: number;
  nextStep?: string;
  verificationNote?: string;
  codeReferences?: string[];
  labelIds?: string[];
}

export const TASK_SORT_OPTIONS = [
  { value: '-updatedAt', label: 'Recently updated' },
  { value: 'dueDate', label: 'Due date (soonest)' },
  { value: '-dueDate', label: 'Due date (latest)' },
  { value: '-priority', label: 'Priority (highest)' },
  { value: 'key', label: 'Task key' },
  { value: '-createdAt', label: 'Newest first' },
  { value: 'progress', label: 'Least progress' },
];
