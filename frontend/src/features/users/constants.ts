import type { GlobalRole } from '../auth/types';

export const GLOBAL_ROLES = ['ADMIN', 'PROJECT_MANAGER', 'DEVELOPER', 'VIEWER'] as const satisfies readonly GlobalRole[];

export const GLOBAL_ROLE_LABELS: Record<GlobalRole, string> = {
  ADMIN: 'Admin',
  PROJECT_MANAGER: 'Project Manager',
  DEVELOPER: 'Developer',
  VIEWER: 'Viewer',
};

export const GLOBAL_ROLE_OPTIONS = GLOBAL_ROLES.map((role) => ({ value: role, label: GLOBAL_ROLE_LABELS[role] }));

export const PROJECT_ROLES = ['MANAGER', 'DEVELOPER', 'VIEWER'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  MANAGER: 'Manager',
  DEVELOPER: 'Developer',
  VIEWER: 'Viewer',
};

export const PROJECT_ROLE_OPTIONS = PROJECT_ROLES.map((role) => ({ value: role, label: PROJECT_ROLE_LABELS[role] }));

export const MILESTONE_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  PLANNED: 'Planned',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const MILESTONE_STATUS_OPTIONS = MILESTONE_STATUSES.map((status) => ({
  value: status,
  label: MILESTONE_STATUS_LABELS[status],
}));

export const MILESTONE_STATUS_BADGES: Record<MilestoneStatus, 'neutral' | 'info' | 'success' | 'danger'> = {
  PLANNED: 'neutral',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};
