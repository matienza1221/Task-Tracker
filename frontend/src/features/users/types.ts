import type { GlobalRole } from '../auth/types';

export interface UserSummary {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  globalRole: GlobalRole;
  timezone: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  projectCount: number;
}

export interface UserLookupResult {
  id: string;
  displayName: string;
  email: string;
  globalRole: GlobalRole;
  avatarUrl: string | null;
}

export interface UserFilters {
  search?: string;
  role?: GlobalRole | '';
  isActive?: 'true' | 'false' | '';
  page?: number;
  pageSize?: number;
}
