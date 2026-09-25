import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bulkUpdateTasks,
  createSubtask,
  createTask,
  deleteTask,
  fetchBoard,
  fetchMyTasks,
  fetchProjectTasks,
  fetchTask,
  fetchTaskActivity,
  moveTask,
  updateTask,
  updateTaskAssignee,
  updateTaskStatus,
} from './api';
import { applyOptimisticMove } from './board';
import type { BoardColumn, BoardFilters, TaskFilters, TaskFormInput } from './types';

export const taskKeys = {
  projectList: (projectId: string, filters: TaskFilters) => ['tasks', 'project', projectId, filters] as const,
  board: (projectId: string, filters: BoardFilters) => ['tasks', 'board', projectId, filters] as const,
  myList: (filters: TaskFilters) => ['tasks', 'mine', filters] as const,
  detail: (taskId: string) => ['tasks', 'detail', taskId] as const,
  activity: (taskId: string, page: number) => ['tasks', 'activity', taskId, page] as const,
};

export function useProjectTasks(projectId: string, filters: TaskFilters, enabled = true) {
  return useQuery({
    queryKey: taskKeys.projectList(projectId, filters),
    queryFn: () => fetchProjectTasks(projectId, filters),
    enabled: Boolean(projectId) && enabled,
    placeholderData: (previous) => previous,
  });
}

/** Board data: columns of tasks ordered by board position. */
export function useBoard(projectId: string, filters: BoardFilters, enabled = true) {
  return useQuery({
    queryKey: taskKeys.board(projectId, filters),
    queryFn: () => fetchBoard(projectId, filters),
    enabled: Boolean(projectId) && enabled,
    placeholderData: (previous) => previous,
  });
}

/**
 * Board move with an optimistic column update: the card follows the pointer
 * immediately, and a rejected move (including 409 conflicts) restores the
 * previous board snapshot before the list refetches.
 */
export function useMoveTask(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { taskId: string; statusId: string; targetIndex: number; version: number }) =>
      moveTask(input.taskId, { statusId: input.statusId, targetIndex: input.targetIndex, version: input.version }),
    onMutate: async (input) => {
      const queries = queryClient.getQueriesData<{ columns: BoardColumn[]; totalTasks: number; truncated: boolean }>({
        queryKey: ['tasks', 'board', projectId],
      });
      await queryClient.cancelQueries({ queryKey: ['tasks', 'board', projectId] });
      const snapshots = queries.map(([key, data]) => ({ key, data }));
      for (const [key, data] of queries) {
        if (!data) continue;
        queryClient.setQueryData(key, {
          ...data,
          columns: applyOptimisticMove(data.columns, input),
        });
      }
      return { snapshots };
    },
    onError: (_error, _input, context) => {
      for (const snapshot of context?.snapshots ?? []) {
        queryClient.setQueryData(snapshot.key, snapshot.data);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my', 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects', 'detail', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects', 'activity', projectId] });
    },
  });
}

export function useBulkUpdateTasks(projectId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: bulkUpdateTasks,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my', 'tasks'] });
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['projects', 'detail', projectId] });
        queryClient.invalidateQueries({ queryKey: ['projects', 'activity', projectId] });
      }
    },
  });
}

export function useMyTasks(filters: TaskFilters) {
  return useQuery({
    queryKey: taskKeys.myList(filters),
    queryFn: () => fetchMyTasks(filters),
    placeholderData: (previous) => previous,
  });
}

export function useTask(taskId: string | undefined) {
  return useQuery({
    queryKey: taskKeys.detail(taskId ?? ''),
    queryFn: () => fetchTask(taskId as string),
    enabled: Boolean(taskId),
  });
}

export function useTaskActivity(taskId: string, page: number) {
  return useQuery({
    queryKey: taskKeys.activity(taskId, page),
    queryFn: () => fetchTaskActivity(taskId, page),
    enabled: Boolean(taskId),
    placeholderData: (previous) => previous,
  });
}

/**
 * Task mutations invalidate task lists, the owning project (progress and
 * counts) and the task detail — keeping the board/list/detail consistent.
 */
function useTaskMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  options: { taskId?: string; projectId?: string } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my', 'tasks'] });
      if (options.projectId) {
        queryClient.invalidateQueries({ queryKey: ['projects', 'detail', options.projectId] });
        queryClient.invalidateQueries({ queryKey: ['projects', 'activity', options.projectId] });
      }
      if (options.taskId) {
        queryClient.invalidateQueries({ queryKey: ['tasks', 'activity', options.taskId] });
      }
    },
  });
}

export function useCreateTask(projectId: string) {
  return useTaskMutation((input: TaskFormInput) => createTask(projectId, input), { projectId });
}

export function useUpdateTask(taskId: string, projectId?: string) {
  return useTaskMutation(
    (input: Partial<TaskFormInput> & { version: number }) => updateTask(taskId, input),
    { taskId, projectId },
  );
}

export function useUpdateTaskStatus(taskId: string, projectId?: string) {
  return useTaskMutation(
    (input: { statusId: string; version: number }) => updateTaskStatus(taskId, input.statusId, input.version),
    { taskId, projectId },
  );
}

export function useUpdateTaskAssignee(taskId: string, projectId?: string) {
  return useTaskMutation(
    (input: { assigneeId: string | null; version: number }) =>
      updateTaskAssignee(taskId, input.assigneeId, input.version),
    { taskId, projectId },
  );
}

export function useCreateSubtask(taskId: string, projectId?: string) {
  return useTaskMutation((input: { title: string }) => createSubtask(taskId, input.title), { taskId, projectId });
}

export function useDeleteTask(projectId?: string) {
  return useTaskMutation((taskId: string) => deleteTask(taskId), { projectId });
}
