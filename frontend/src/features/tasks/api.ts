import { apiDelete, apiGet, apiGetEnvelope, apiPatch, apiPost } from '../../lib/api/axios';
import { toQueryString } from '../../lib/api/queryString';
import type { ActivityEntry } from '../projects/types';
import type { BoardColumn, BoardFilters, Task, TaskFilters, TaskFormInput } from './types';

export const fetchProjectTasks = (projectId: string, filters: TaskFilters) =>
  apiGetEnvelope<{ tasks: Task[] }>(`/projects/${projectId}/tasks${toQueryString({ ...filters })}`);

export const fetchMyTasks = (filters: TaskFilters) =>
  apiGetEnvelope<{ tasks: Task[] }>(`/my/tasks${toQueryString({ ...filters })}`);

export const fetchBoard = (projectId: string, filters: BoardFilters) =>
  apiGet<{ columns: BoardColumn[]; totalTasks: number; truncated: boolean }>(
    `/projects/${projectId}/board${toQueryString({ ...filters })}`,
  );

export const moveTask = (taskId: string, input: { statusId: string; targetIndex: number; version: number }) =>
  apiPost<{ task: Task }>(`/tasks/${taskId}/move`, input);

export const bulkUpdateTasks = (input: {
  taskIds: string[];
  action: 'set-status' | 'set-priority' | 'set-assignee' | 'delete';
  statusId?: string;
  priorityId?: string;
  assigneeId?: string | null;
}) => apiPost<{ updated: number; action: string }>('/tasks/bulk', input);

export const fetchTask = (taskId: string) => apiGet<{ task: Task }>(`/tasks/${taskId}`);

export const createTask = (projectId: string, input: TaskFormInput) =>
  apiPost<{ task: Task }>(`/projects/${projectId}/tasks`, input);

export const updateTask = (taskId: string, input: Partial<TaskFormInput> & { version: number }) =>
  apiPatch<{ task: Task }>(`/tasks/${taskId}`, input);

export const updateTaskStatus = (taskId: string, statusId: string, version: number) =>
  apiPatch<{ task: Task }>(`/tasks/${taskId}/status`, { statusId, version });

export const updateTaskAssignee = (taskId: string, assigneeId: string | null, version: number) =>
  apiPatch<{ task: Task }>(`/tasks/${taskId}/assignee`, { assigneeId, version });

export const createSubtask = (taskId: string, title: string) =>
  apiPost<{ task: Task }>(`/tasks/${taskId}/subtasks`, { title });

export const deleteTask = (taskId: string) => apiDelete<null>(`/tasks/${taskId}`);

export const fetchTaskActivity = (taskId: string, page = 1, pageSize = 25) =>
  apiGetEnvelope<{ activity: ActivityEntry[] }>(`/tasks/${taskId}/activity${toQueryString({ page, pageSize })}`);
