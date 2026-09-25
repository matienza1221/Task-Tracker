import { apiGetEnvelope, apiPatch, apiPost } from '../../lib/api/axios';
import { toQueryString } from '../../lib/api/queryString';
import type { AppNotification, NotificationFilters } from './types';

export const fetchNotifications = (filters: NotificationFilters) =>
  apiGetEnvelope<{ notifications: AppNotification[] }>(`/notifications${toQueryString({ ...filters })}`);

export const markNotificationRead = (notificationId: string, read = true) =>
  apiPatch<null>(`/notifications/${notificationId}/read`, { read });

export const markAllNotificationsRead = () => apiPost<{ updated: number }>('/notifications/read-all');
