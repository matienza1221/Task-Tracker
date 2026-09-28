import { apiDelete, apiGet, apiGetEnvelope, apiPatch, apiPost } from '../../lib/api/axios';
import { toQueryString } from '../../lib/api/queryString';
import type { CreateUserFormValues } from './schemas';
import type { UserFilters, UserLookupResult, UserSummary } from './types';
import type { GlobalRole } from '../auth/types';

export interface PaginationMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
}

export const fetchUsers = (filters: UserFilters) =>
  apiGetEnvelope<{ users: UserSummary[] }>(`/users${toQueryString({ ...filters })}`);

export const fetchUserLookup = (search: string, limit?: number) =>
  apiGet<{ users: UserLookupResult[] }>(`/users/lookup${toQueryString({ search, limit })}`);

export const createUser = (input: Omit<CreateUserFormValues, 'password'> & { password?: string }) =>
  apiPost<{ user: UserSummary; temporaryPassword: string | null }>('/users', input);

export const updateUser = (userId: string, input: { displayName?: string; timezone?: string; isActive?: boolean }) =>
  apiPatch<{ user: UserSummary }>(`/users/${userId}`, input);

export const changeUserRole = (userId: string, globalRole: GlobalRole) =>
  apiPatch<{ user: UserSummary }>(`/users/${userId}/role`, { globalRole });

export const resetUserPassword = (userId: string) =>
  apiPost<{ temporaryPassword: string }>(`/users/${userId}/reset-password`);

export const deleteUser = (userId: string, purge = false) =>
  apiDelete<null>(`/users/${userId}${toQueryString({ purge })}`);
