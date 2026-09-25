import { apiDelete, apiGetEnvelope, apiPost } from '../../lib/api/axios';
import { toQueryString } from '../../lib/api/queryString';
import type { AttachmentDto } from './types';

export const fetchAttachments = (taskId: string, page = 1, pageSize = 50) =>
  apiGetEnvelope<{ attachments: AttachmentDto[] }>(
    `/tasks/${taskId}/attachments${toQueryString({ page, pageSize })}`,
  );

export const uploadAttachment = (taskId: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  // The browser sets the multipart boundary; never set Content-Type manually.
  return apiPost<{ attachment: AttachmentDto }>(`/tasks/${taskId}/attachments`, formData);
};

export const deleteAttachment = (attachmentId: string) => apiDelete<null>(`/attachments/${attachmentId}`);

export const attachmentDownloadUrl = (attachmentId: string) => `/api/attachments/${attachmentId}/download`;
