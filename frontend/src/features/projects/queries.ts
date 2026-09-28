import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiPatch } from '../../lib/api/axios';
import type { ProjectRole } from '../users/constants';
import {
  addMember,
  archiveProject,
  createLabel,
  createMilestone,
  createSavedView,
  deleteSavedView,
  createProject,
  deleteLabel,
  deleteMilestone,
  deleteProject,
  fetchActivity,
  fetchLabels,
  fetchMemberProgress,
  fetchMembers,
  fetchMilestones,
  fetchProject,
  fetchProjects,
  fetchSavedViews,
  removeMember,
  unarchiveProject,
  updateLabel,
  updateMemberRole,
  updateMilestone,
  updateProject,
} from './api';
import type { AddMemberFormValues, LabelFormValues, MilestoneFormValues, ProjectFormValues } from './schemas';
import type { ProjectFilters } from './types';

export const projectKeys = {
  list: (filters: ProjectFilters) => ['projects', 'list', filters] as const,
  detail: (projectId: string) => ['projects', 'detail', projectId] as const,
  members: (projectId: string) => ['projects', 'members', projectId] as const,
  memberProgress: (projectId: string) => ['projects', 'members', 'progress', projectId] as const,
  milestones: (projectId: string) => ['projects', 'milestones', projectId] as const,
  labels: (projectId: string) => ['projects', 'labels', projectId] as const,
  savedViews: (projectId: string) => ['projects', 'saved-views', projectId] as const,
  activity: (projectId: string, page: number) => ['projects', 'activity', projectId, page] as const,
};

export function useProjects(filters: ProjectFilters) {
  return useQuery({
    queryKey: projectKeys.list(filters),
    queryFn: () => fetchProjects(filters),
    placeholderData: (previous) => previous,
  });
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(projectId ?? ''),
    queryFn: () => fetchProject(projectId as string),
    enabled: Boolean(projectId),
  });
}

function useProjectMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  options: { invalidateProject?: boolean; projectId?: string } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', 'list'] });
      if (options.invalidateProject && options.projectId) {
        queryClient.invalidateQueries({ queryKey: projectKeys.detail(options.projectId) });
      }
    },
  });
}

export function useCreateProject() {
  return useProjectMutation((input: ProjectFormValues) => createProject(input));
}

export function useUpdateProject(projectId: string) {
  return useProjectMutation(
    (input: Parameters<typeof updateProject>[1]) => updateProject(projectId, input),
    { invalidateProject: true, projectId },
  );
}

export function useArchiveProject(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archived: boolean) => (archived ? archiveProject(projectId) : unarchiveProject(projectId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; purge?: boolean }) => deleteProject(input.projectId, input.purge),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useMembers(projectId: string, enabled = true) {
  return useQuery({
    queryKey: projectKeys.members(projectId),
    queryFn: () => fetchMembers(projectId),
    enabled,
  });
}

export function useMemberProgress(projectId: string, enabled = true) {
  return useQuery({
    queryKey: projectKeys.memberProgress(projectId),
    queryFn: () => fetchMemberProgress(projectId),
    enabled: enabled && Boolean(projectId),
  });
}

export function useAddMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddMemberFormValues) => addMember(projectId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

export function useUpdateMemberRole(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; projectRole: ProjectRole }) =>
      updateMemberRole(projectId, input.userId, input.projectRole),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) }),
  });
}

export function useRemoveMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeMember(projectId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.members(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    },
  });
}

export function useMilestones(projectId: string, enabled = true) {
  return useQuery({
    queryKey: projectKeys.milestones(projectId),
    queryFn: () => fetchMilestones(projectId),
    enabled: enabled && Boolean(projectId),
  });
}

function useMilestoneInvalidation(projectId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: projectKeys.milestones(projectId) });
    queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
    queryClient.invalidateQueries({ queryKey: projectKeys.activity(projectId, 1) });
  };
}

export function useCreateMilestone(projectId: string) {
  const invalidate = useMilestoneInvalidation(projectId);
  return useMutation({ mutationFn: (input: MilestoneFormValues) => createMilestone(projectId, input), onSuccess: invalidate });
}

export function useUpdateMilestone(projectId: string) {
  const invalidate = useMilestoneInvalidation(projectId);
  return useMutation({
    mutationFn: (input: { milestoneId: string; data: Partial<MilestoneFormValues> }) =>
      updateMilestone(projectId, input.milestoneId, input.data),
    onSuccess: invalidate,
  });
}

export function useDeleteMilestone(projectId: string) {
  const invalidate = useMilestoneInvalidation(projectId);
  return useMutation({ mutationFn: (milestoneId: string) => deleteMilestone(projectId, milestoneId), onSuccess: invalidate });
}

export function useLabels(projectId: string, enabled = true) {
  return useQuery({
    queryKey: projectKeys.labels(projectId),
    queryFn: () => fetchLabels(projectId),
    enabled: enabled && Boolean(projectId),
  });
}

function useLabelInvalidation(projectId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: projectKeys.labels(projectId) });
    queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
  };
}

export function useCreateLabel(projectId: string) {
  const invalidate = useLabelInvalidation(projectId);
  return useMutation({ mutationFn: (input: LabelFormValues) => createLabel(projectId, input), onSuccess: invalidate });
}

export function useUpdateLabel(projectId: string) {
  const invalidate = useLabelInvalidation(projectId);
  return useMutation({
    mutationFn: (input: { labelId: string; data: Partial<LabelFormValues> }) =>
      updateLabel(projectId, input.labelId, input.data),
    onSuccess: invalidate,
  });
}

export function useDeleteLabel(projectId: string) {
  const invalidate = useLabelInvalidation(projectId);
  return useMutation({ mutationFn: (labelId: string) => deleteLabel(projectId, labelId), onSuccess: invalidate });
}

export function useSavedViews(projectId: string) {
  return useQuery({ queryKey: projectKeys.savedViews(projectId), queryFn: () => fetchSavedViews(projectId) });
}

export function useSavedViewMutations(projectId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: projectKeys.savedViews(projectId) });
  return {
    create: useMutation({
      mutationFn: (input: { name: string; filters: Record<string, unknown>; isDefault?: boolean }) =>
        createSavedView(projectId, input),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (viewId: string) => deleteSavedView(projectId, viewId), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: (input: { viewId: string; name?: string; filters?: Record<string, unknown>; isDefault?: boolean }) =>
        apiPatch<{ savedView: unknown }>(`/projects/${projectId}/saved-views/${input.viewId}`, {
          name: input.name,
          filters: input.filters,
          isDefault: input.isDefault,
        }),
      onSuccess: invalidate,
    }),
  };
}

export function useActivity(projectId: string, page: number) {
  return useQuery({
    queryKey: projectKeys.activity(projectId, page),
    queryFn: () => fetchActivity(projectId, page),
    placeholderData: (previous) => previous,
  });
}
