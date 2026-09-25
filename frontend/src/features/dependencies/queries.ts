import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDependency, fetchDependencies, removeDependency } from './api';

export const dependencyKeys = {
  list: (taskId: string) => ['dependencies', taskId] as const,
};

export function useDependencies(taskId: string, enabled = true) {
  return useQuery({
    queryKey: dependencyKeys.list(taskId),
    queryFn: () => fetchDependencies(taskId),
    enabled: enabled && Boolean(taskId),
  });
}

function useDependencyMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dependencyKeys.list(taskId) });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'detail', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'activity', taskId] });
    },
  });
}

export function useAddDependency(taskId: string) {
  return useDependencyMutation((dependsOnTaskId: string) => addDependency(taskId, dependsOnTaskId), taskId);
}

export function useRemoveDependency(taskId: string) {
  return useDependencyMutation(
    (input: { blockedTaskId: string; dependsOnTaskId: string }) =>
      removeDependency(input.blockedTaskId, input.dependsOnTaskId),
    taskId,
  );
}
