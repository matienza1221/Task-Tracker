import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { BellIcon } from '../ui/icons';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useRecentNotifications,
} from '../../features/notifications/queries';
import type { AppNotification } from '../../features/notifications/types';
import { formatRelative } from '../../lib/format';
import { cn } from '../../lib/cn';
import { toast } from '../../stores/toastStore';

const TYPE_TONES: Record<string, 'indigo' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  TASK_ASSIGNED: 'indigo',
  TASK_STATUS_CHANGED: 'info',
  TASK_COMMENTED: 'neutral',
  TASK_MENTIONED: 'indigo',
  TASK_DUE_SOON: 'warning',
  TASK_OVERDUE: 'danger',
  PROJECT_MEMBER_ADDED: 'success',
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const recent = useRecentNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    menuRef.current?.querySelector<HTMLElement>('button:not([disabled]), a[href]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const focusables = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]') ?? [],
    );
    if (focusables.length === 0) return;
    const index = focusables.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusables[(index + 1 + focusables.length) % focusables.length].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusables[(index - 1 + focusables.length) % focusables.length].focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  const items: AppNotification[] = recent.data?.data.notifications ?? [];
  const unreadCount = Number(recent.data?.meta.unreadCount ?? 0);

  const openNotification = (notification: AppNotification) => {
    if (!notification.isRead) markRead.mutate({ notificationId: notification.id });
    setOpen(false);
    if (notification.taskId) navigate(`/tasks/${notification.taskId}`);
    else if (notification.projectId) navigate(`/projects/${notification.projectId}`);
    else navigate('/notifications');
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        <BellIcon className="text-lg" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Notifications"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notifications</p>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
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
            )}
          </div>

          {recent.isLoading && <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
          {!recent.isLoading && items.length === 0 && (
            <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">You have no notifications.</p>
          )}

          {items.length > 0 && (
            <ul className="max-h-80 overflow-y-auto scrollbar-thin">
              {items.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(notification)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60',
                      !notification.isRead && 'bg-indigo-50/40 dark:bg-indigo-950/20',
                    )}
                  >
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', notification.isRead ? 'bg-slate-300 dark:bg-slate-600' : 'bg-indigo-500')} />
                    <span className="sr-only">{notification.isRead ? 'Read' : 'Unread'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {notification.title}
                        </span>
                        <Badge variant={TYPE_TONES[notification.type] ?? 'neutral'} className="shrink-0">
                          {notification.type.replace('TASK_', '').replace('PROJECT_', '').toLowerCase()}
                        </Badge>
                      </span>
                      {notification.body && (
                        <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                          {notification.body}
                        </span>
                      )}
                      <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500">
                        {formatRelative(notification.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-slate-200 px-4 py-2.5 text-center dark:border-slate-800">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
