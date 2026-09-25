import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteAttachment, fetchAttachments, uploadAttachment } from './api';

export const attachmentKeys = {
  list: (taskId: string) => ['attachments', taskId] as const,
};

export function useAttachments(taskId: string, enabled = true) {
  return useQuery({
    queryKey: attachmentKeys.list(taskId),
    queryFn: () => fetchAttachments(taskId),
    enabled: enabled && Boolean(taskId),
  });
}

function useAttachmentMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>, taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: attachmentKeys.list(taskId) });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'activity', taskId] });
    },
  });
}

export function useUploadAttachment(taskId: string) {
  return useAttachmentMutation((file: File) => uploadAttachment(taskId, file), taskId);
}

export function useDeleteAttachment(taskId: string) {
  return useAttachmentMutation((attachmentId: string) => deleteAttachment(attachmentId), taskId);
}
