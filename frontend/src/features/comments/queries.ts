import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createComment, deleteComment, fetchComments, updateComment } from './api';
import type { CommentInput } from './types';

export const commentKeys = {
  list: (taskId: string) => ['comments', taskId] as const,
};

export function useComments(taskId: string, enabled = true) {
  return useQuery({
    queryKey: commentKeys.list(taskId),
    queryFn: () => fetchComments(taskId),
    enabled: enabled && Boolean(taskId),
  });
}

function useCommentMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentKeys.list(taskId) });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'activity', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'detail', taskId] });
    },
  });
}

export function useCreateComment(taskId: string) {
  return useCommentMutation((input: CommentInput) => createComment(taskId, input), taskId);
}

export function useUpdateComment(taskId: string) {
  return useCommentMutation(
    (input: { commentId: string; body: string }) => updateComment(input.commentId, { body: input.body }),
    taskId,
  );
}

export function useDeleteComment(taskId: string) {
  return useCommentMutation((commentId: string) => deleteComment(commentId), taskId);
}
