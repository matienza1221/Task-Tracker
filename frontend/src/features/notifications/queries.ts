import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from './api';
import type { NotificationFilters } from './types';

export const notificationKeys = {
  list: (filters: NotificationFilters) => ['notifications', filters] as const,
  recent: ['notifications', 'recent'] as const,
};

export function useNotifications(filters: NotificationFilters = {}) {
  return useQuery({
    queryKey: notificationKeys.list(filters),
    queryFn: () => fetchNotifications(filters),
    placeholderData: (previous) => previous,
  });
}

/** Small poll used by the bell so unread counts stay fresh. */
export function useRecentNotifications() {
  return useQuery({
    queryKey: notificationKeys.recent,
    queryFn: () => fetchNotifications({ page: 1, pageSize: 8 }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { notificationId: string; read?: boolean }) =>
      markNotificationRead(input.notificationId, input.read ?? true),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
