import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { commitImportJob, fetchImportJob, fetchImportJobs, previewImportJob, uploadImportFile } from './api';
import type { ImportRequestInput } from './types';

export const importKeys = {
  list: (page: number) => ['imports', 'list', page] as const,
  job: (jobId: string, page: number) => ['imports', 'job', jobId, page] as const,
};

export function useImportJobs(page = 1) {
  return useQuery({ queryKey: importKeys.list(page), queryFn: () => fetchImportJobs(page) });
}

export function useImportJob(jobId: string | undefined, page = 1) {
  return useQuery({
    queryKey: importKeys.job(jobId ?? '', page),
    queryFn: () => fetchImportJob(jobId as string, page),
    enabled: Boolean(jobId),
  });
}

export function useUploadImport() {
  return useMutation({ mutationFn: uploadImportFile });
}

export function usePreviewImport() {
  return useMutation({
    mutationFn: (input: { jobId: string } & ImportRequestInput) =>
      previewImportJob(input.jobId, {
        projectId: input.projectId,
        mapping: input.mapping,
        skipDuplicates: input.skipDuplicates,
        defaults: input.defaults,
      }),
  });
}

export function useCommitImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { jobId: string } & ImportRequestInput) =>
      commitImportJob(input.jobId, {
        projectId: input.projectId,
        mapping: input.mapping,
        skipDuplicates: input.skipDuplicates,
        defaults: input.defaults,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
