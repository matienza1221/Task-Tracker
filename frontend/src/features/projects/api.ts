import { apiDelete, apiGet, apiGetEnvelope, apiPatch, apiPost } from '../../lib/api/axios';
import { toQueryString } from '../../lib/api/queryString';
import type { ProjectRole } from '../users/constants';
import type { AddMemberFormValues, LabelFormValues, MilestoneFormValues, ProjectFormValues } from './schemas';
import type { ActivityEntry, MemberProgress, Milestone, Project, ProjectFilters, ProjectLabel, ProjectMember, SavedView } from './types';
import type { PaginationMeta } from '../users/api';

export type ProjectEnvelope = { project: Project };
export type { PaginationMeta };

export const fetchProjects = (filters: ProjectFilters) =>
  apiGetEnvelope<{ projects: Project[] }>(`/projects${toQueryString({ ...filters })}`);

export const fetchProject = (projectId: string) => apiGet<ProjectEnvelope>(`/projects/${projectId}`);

export const createProject = (input: ProjectFormValues) => apiPost<ProjectEnvelope>('/projects', input);

export const updateProject = (
  projectId: string,
  input: Partial<Omit<ProjectFormValues, 'code'>> & { progressWeighting?: 'COUNT' | 'HOURS' },
) => apiPatch<ProjectEnvelope>(`/projects/${projectId}`, input);

export const archiveProject = (projectId: string) => apiPost<ProjectEnvelope>(`/projects/${projectId}/archive`);
export const unarchiveProject = (projectId: string) => apiPost<ProjectEnvelope>(`/projects/${projectId}/unarchive`);
export const deleteProject = (projectId: string, purge = false) =>
  apiDelete<null>(`/projects/${projectId}${toQueryString({ purge })}`);

export const fetchMembers = (projectId: string) => apiGet<{ members: ProjectMember[] }>(`/projects/${projectId}/members`);
export const fetchMemberProgress = (projectId: string) =>
  apiGet<{ members: MemberProgress[] }>(`/projects/${projectId}/members/progress`);
export const addMember = (projectId: string, input: AddMemberFormValues) =>
  apiPost<{ member: ProjectMember }>(`/projects/${projectId}/members`, input);
export const updateMemberRole = (projectId: string, userId: string, projectRole: ProjectRole) =>
  apiPatch<{ member: ProjectMember }>(`/projects/${projectId}/members/${userId}`, { projectRole });
export const removeMember = (projectId: string, userId: string) =>
  apiDelete<null>(`/projects/${projectId}/members/${userId}`);

export const fetchMilestones = (projectId: string) =>
  apiGet<{ milestones: Milestone[] }>(`/projects/${projectId}/milestones`);
export const createMilestone = (projectId: string, input: MilestoneFormValues) =>
  apiPost<{ milestone: Milestone }>(`/projects/${projectId}/milestones`, input);
export const updateMilestone = (projectId: string, milestoneId: string, input: Partial<MilestoneFormValues>) =>
  apiPatch<{ milestone: Milestone }>(`/projects/${projectId}/milestones/${milestoneId}`, input);
export const deleteMilestone = (projectId: string, milestoneId: string) =>
  apiDelete<null>(`/projects/${projectId}/milestones/${milestoneId}`);

export const fetchLabels = (projectId: string) => apiGet<{ labels: ProjectLabel[] }>(`/projects/${projectId}/labels`);
export const createLabel = (projectId: string, input: LabelFormValues) =>
  apiPost<{ label: ProjectLabel }>(`/projects/${projectId}/labels`, input);
export const updateLabel = (projectId: string, labelId: string, input: Partial<LabelFormValues>) =>
  apiPatch<{ label: ProjectLabel }>(`/projects/${projectId}/labels/${labelId}`, input);
export const deleteLabel = (projectId: string, labelId: string) =>
  apiDelete<null>(`/projects/${projectId}/labels/${labelId}`);

export const fetchSavedViews = (projectId: string) =>
  apiGet<{ savedViews: SavedView[] }>(`/projects/${projectId}/saved-views`);
export const createSavedView = (projectId: string, input: { name: string; filters: Record<string, unknown>; isDefault?: boolean }) =>
  apiPost<{ savedView: SavedView }>(`/projects/${projectId}/saved-views`, input);
export const deleteSavedView = (projectId: string, viewId: string) =>
  apiDelete<null>(`/projects/${projectId}/saved-views/${viewId}`);

export const fetchActivity = (projectId: string, page = 1, pageSize = 25) =>
  apiGetEnvelope<{ activity: ActivityEntry[] }>(
    `/projects/${projectId}/activity${toQueryString({ page, pageSize })}`,
  );
