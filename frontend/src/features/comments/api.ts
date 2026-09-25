import { apiDelete, apiGetEnvelope, apiPatch, apiPost } from '../../lib/api/axios';
import { toQueryString } from '../../lib/api/queryString';
import type { Comment, CommentInput } from './types';

export const fetchComments = (taskId: string, page = 1, pageSize = 50) =>
  apiGetEnvelope<{ comments: Comment[] }>(`/tasks/${taskId}/comments${toQueryString({ page, pageSize })}`);

export const createComment = (taskId: string, input: CommentInput) =>
  apiPost<{ comment: Comment }>(`/tasks/${taskId}/comments`, input);

export const updateComment = (commentId: string, input: { body: string }) =>
  apiPatch<{ comment: Comment }>(`/comments/${commentId}`, input);

export const deleteComment = (commentId: string) => apiDelete<null>(`/comments/${commentId}`);
