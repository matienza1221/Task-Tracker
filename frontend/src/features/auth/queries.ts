import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMe, loginRequest, logoutRequest, changePasswordRequest } from './api';
import type { AuthUser, UserPayload } from './types';

export const meQueryKey = ['me'] as const;

/** Session bootstrap. The `/me` result is the source of truth for permissions. */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: fetchMe,
    retry: false,
    staleTime: 5 * 60_000,
    select: (payload: UserPayload): AuthUser => payload.user,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: loginRequest,
    onSuccess: (payload) => {
      queryClient.setQueryData<UserPayload>(meQueryKey, payload);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logoutRequest,
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: changePasswordRequest });
}
