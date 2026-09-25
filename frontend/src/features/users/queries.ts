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
export const userLookupQueryKey = (search: string) => ['users', 'lookup', search] as const;

export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: usersListQueryKey(filters),
    queryFn: () => fetchUsers(filters),
    placeholderData: (previous) => previous,
  });
}

/** Type-ahead directory used by member/managers pickers. */
export function useUserLookup(search: string) {
  const term = search.trim();
  return useQuery({
    queryKey: userLookupQueryKey(term),
    queryFn: () => fetchUserLookup(term),
    enabled: term.length >= 2,
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
