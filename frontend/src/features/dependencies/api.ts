import { apiDelete, apiGet, apiPost } from '../../lib/api/axios';
import type { TaskDependencies } from './types';

export const fetchDependencies = (taskId: string) => apiGet<TaskDependencies>(`/tasks/${taskId}/dependencies`);

export const addDependency = (taskId: string, dependsOnTaskId: string) =>
  apiPost<TaskDependencies>(`/tasks/${taskId}/dependencies`, { dependsOnTaskId });

export const removeDependency = (taskId: string, dependsOnTaskId: string) =>
  apiDelete<TaskDependencies>(`/tasks/${taskId}/dependencies/${dependsOnTaskId}`);
