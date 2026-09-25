import type { EffectiveProjectRole } from '../auth/roles';
import type { GlobalRole } from '../auth/types';
import type { MilestoneStatus, ProjectRole } from '../users/constants';

export interface ProjectStatusDto {
  id: string;
  key: string;
  name: string;
  category: string;
  color: string;
}

export interface ProjectPriorityDto {
  id: string;
  key: string;
  name: string;
  weight: number;
  color: string;
}

export interface ProjectPersonDto {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: ProjectStatusDto;
  priority: ProjectPriorityDto;
  startDate: string | null;
  targetDate: string | null;
  actualCompletionDate: string | null;
  manager: ProjectPersonDto | null;
  createdBy: { id: string; displayName: string } | null;
  progress: number;
  progressWeighting: 'COUNT' | 'HOURS';
  isArchived: boolean;
  archivedAt: string | null;
  myRole: EffectiveProjectRole | null;
  memberCount: number;
  milestoneCount: number;
  labelCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  globalRole: GlobalRole;
  projectRole: ProjectRole;
  isProjectManager: boolean;
  addedBy: { id: string; displayName: string } | null;
  createdAt: string;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  targetDate: string | null;
  status: MilestoneStatus;
  completedAt: string | null;
  sortOrder: number;
  /** Derived from the tasks linked to this milestone. */
  taskCount: number;
  completedTaskCount: number;
  overdueTaskCount: number;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectLabel {
  id: string;
  projectId: string | null;
  name: string;
  color: string;
  isGlobal: boolean;
  createdAt: string;
}

export interface SavedView {
  id: string;
  projectId: string | null;
  name: string;
  scope: string;
  filters: Record<string, unknown>;
  isDefault: boolean;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEntry {
  id: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  metadata: Record<string, unknown> | null;
  actor: { id: string | null; displayName: string };
  /** Present for project feeds when the event belongs to a task. */
  task?: { id: string; key: string } | null;
  createdAt: string;
}

export interface ProjectFilters {
  search?: string;
  statusKey?: string;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
}
