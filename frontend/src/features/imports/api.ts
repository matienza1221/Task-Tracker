import { apiGet, apiGetEnvelope, apiPost } from '../../lib/api/axios';
import { toQueryString } from '../../lib/api/queryString';
import type { ImportCommitResult, ImportJobInfo, ImportPreviewResult, ImportRequestInput, ImportRowPreview, ImportUploadResult } from './types';

export const uploadImportFile = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return apiPost<ImportUploadResult>('/admin/imports', formData);
};

export const previewImportJob = (jobId: string, input: ImportRequestInput) =>
  apiPost<ImportPreviewResult>(`/admin/imports/${jobId}/preview`, input);

export const commitImportJob = (jobId: string, input: ImportRequestInput) =>
  apiPost<ImportCommitResult>(`/admin/imports/${jobId}/commit`, input);

export const fetchImportJob = (jobId: string, page = 1, pageSize = 25) =>
  apiGetEnvelope<{ job: ImportJobInfo; counts: Record<string, number>; rows: ImportRowPreview[]; total: number }>(
    `/admin/imports/${jobId}${toQueryString({ page, pageSize })}`,
  );

export const fetchImportJobs = (page = 1, pageSize = 10) =>
  apiGetEnvelope<{ imports: (ImportJobInfo & { createdBy: { id: string; displayName: string } | null })[] }>(
    `/admin/imports${toQueryString({ page, pageSize })}`,
  );

export { apiGet };
