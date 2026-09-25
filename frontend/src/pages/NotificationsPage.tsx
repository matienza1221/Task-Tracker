import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { BellIcon } from '../components/ui/icons';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../features/notifications/queries';
import { NOTIFICATION_TYPE_LABELS, type AppNotification } from '../features/notifications/types';
import { cn } from '../lib/cn';
import { formatDateTime, formatRelative } from '../lib/format';
import { toast } from '../stores/toastStore';

const TYPE_TONES: Record<string, 'indigo' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  TASK_ASSIGNED: 'indigo',
  TASK_STATUS_CHANGED: 'info',
  TASK_COMMENTED: 'neutral',
  TASK_MENTIONED: 'indigo',
  TASK_DUE_SOON: 'warning',
  TASK_OVERDUE: 'danger',
  PROJECT_MEMBER_ADDED: 'success',
};

function entityLink(notification: AppNotification): string {
  if (notification.taskId) return `/tasks/${notification.taskId}`;
  if (notification.projectId) return `/projects/${notification.projectId}`;
  return '/notifications';
}

export function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const notifications = useNotifications({ unreadOnly: unreadOnly || undefined, page, pageSize: 20 });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = notifications.data?.data.notifications ?? [];
  const unreadCount = Number(notifications.data?.meta.unreadCount ?? 0);
  const total = Number(notifications.data?.meta.total ?? items.length);
  const totalPages = Number(notifications.data?.meta.totalPages ?? 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-white">
            <BellIcon className="text-lg text-indigo-500" />
            Notifications
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {total} notification{total === 1 ? '' : 's'}
            {unreadCount > 0 && <span className="ml-1 font-medium text-indigo-600 dark:text-indigo-400">· {unreadCount} unread</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Filter notifications" className="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
            {[
              { id: 'all', label: 'All', value: false },
              { id: 'unread', label: 'Unread', value: true },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={unreadOnly === option.value}
                onClick={() => {
                  setUnreadOnly(option.value);
                  setPage(1);
                }}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  unreadOnly === option.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={unreadCount === 0}
            loading={markAllRead.isPending}
            onClick={() =>
              markAllRead.mutate(undefined, {
                onSuccess: (result) => toast.success(`${result.updated} marked as read`),
                onError: (error) => toast.error('Could not mark all as read', error.message),
              })
            }
          >
            Mark all read
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader title="Inbox" description="Assignments, mentions, comments and reminders" />
        {notifications.isLoading && (
          <CardBody className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-3/4" />
          </CardBody>
        )}
        {notifications.isError && (
          <CardBody>
            <ErrorState
              title="Could not load notifications"
              description={notifications.error.message}
              onRetry={() => notifications.refetch()}
            />
          </CardBody>
        )}
        {!notifications.isLoading && !notifications.isError && items.length === 0 && (
          <CardBody>
            <EmptyState
              title={unreadOnly ? 'No unread notifications' : 'No notifications yet'}
              description="You will be notified when work is assigned to you, when you are mentioned, or when a task becomes due."
            />
          </CardBody>
        )}

        {items.length > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((notification) => (
              <li
                key={notification.id}
                className={cn('flex flex-wrap items-start gap-3 px-5 py-4', !notification.isRead && 'bg-indigo-50/40 dark:bg-indigo-950/20')}
              >
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', notification.isRead ? 'bg-slate-300 dark:bg-slate-600' : 'bg-indigo-500')} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={entityLink(notification)}
                      className="text-sm font-medium text-slate-900 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400"
                    >
                      {notification.title}
                    </Link>
                    <Badge variant={TYPE_TONES[notification.type] ?? 'neutral'}>
                      {NOTIFICATION_TYPE_LABELS[notification.type] ?? notification.type}
                    </Badge>
                  </div>
                  {notification.body && (
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{notification.body}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500" title={formatDateTime(notification.createdAt)}>
                    {formatRelative(notification.createdAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={markRead.isPending}
                  onClick={() =>
                    markRead.mutate(
                      { notificationId: notification.id, read: !notification.isRead },
                      {
                        onSuccess: () => toast.success(notification.isRead ? 'Marked as unread' : 'Marked as read'),
                        onError: (error) => toast.error('Could not update notification', error.message),
                      },
                    )
                  }
                >
                  {notification.isRead ? 'Mark unread' : 'Mark read'}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <CardBody className="border-t border-slate-100 dark:border-slate-800">
          <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
        </CardBody>
      </Card>
    </div>
  );
}
