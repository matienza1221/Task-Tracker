export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string;
  entityId: string;
  projectId: string | null;
  taskId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationFilters {
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  TASK_ASSIGNED: 'Assignment',
  TASK_STATUS_CHANGED: 'Status change',
  TASK_COMMENTED: 'Comment',
  TASK_MENTIONED: 'Mention',
  TASK_DUE_SOON: 'Due soon',
  TASK_OVERDUE: 'Overdue',
  PROJECT_MEMBER_ADDED: 'Project',
};
