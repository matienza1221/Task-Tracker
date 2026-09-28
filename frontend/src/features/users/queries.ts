import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GlobalRole } from '../auth/types';
import {
  changeUserRole,
  createUser,
  deleteUser,
  fetchUserLookup,
  fetchUsers,
  resetUserPassword,
  updateUser,
} from './api';
import type { UserFilters } from './types';

export const usersListQueryKey = (filters: UserFilters) => ['users', 'list', filters] as const;
export const userLookupQueryKey = (search: string, limit: number) => ['users', 'lookup', search, limit] as const;

export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: usersListQueryKey(filters),
    queryFn: () => fetchUsers(filters),
    placeholderData: (previous) => previous,
  });
}

/**
 * Type-ahead directory used by member/manager pickers. An empty search returns
 * a default list of selectable users so pickers can show a dropdown before the
 * caller types; `enabled` lets the picker defer the request until it opens.
 */
export function useUserLookup(search: string, options: { enabled?: boolean; limit?: number } = {}) {
  const term = search.trim();
  const limit = options.limit ?? 10;
  return useQuery({
    queryKey: userLookupQueryKey(term, limit),
    queryFn: () => fetchUserLookup(term, limit),
    enabled: options.enabled ?? true,
    staleTime: 60_000,
  });
}

function useUserMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useCreateUser() {
  return useUserMutation(createUser);
}

export function useUpdateUser() {
  return useUserMutation((input: { userId: string } & Parameters<typeof updateUser>[1]) =>
    updateUser(input.userId, input),
  );
}

export function useChangeUserRole() {
  return useUserMutation((input: { userId: string; globalRole: GlobalRole }) =>
    changeUserRole(input.userId, input.globalRole),
  );
}

export function useResetUserPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => resetUserPassword(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeleteUser() {
  return useUserMutation((input: { userId: string; purge?: boolean }) => deleteUser(input.userId, input.purge));
}
