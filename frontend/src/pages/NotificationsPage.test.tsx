import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsPage } from './NotificationsPage';
import type { AppNotification } from '../features/notifications/types';

vi.mock('../features/notifications/api', () => ({
  fetchNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

const { fetchNotifications, markNotificationRead, markAllNotificationsRead } = await import(
  '../features/notifications/api'
);
const mockedFetch = vi.mocked(fetchNotifications);
const mockedMarkRead = vi.mocked(markNotificationRead);
const mockedMarkAll = vi.mocked(markAllNotificationsRead);

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n1',
    type: 'TASK_MENTIONED',
    title: 'Marvin mentioned you on WEBAPP-2',
    body: 'Can you review the auth flow?',
    entityType: 'task',
    entityId: 't2',
    projectId: 'p1',
    taskId: 't2',
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/notifications']}>
        <NotificationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedMarkRead.mockReset();
    mockedMarkAll.mockReset();
    mockedFetch.mockResolvedValue({
      data: {
        notifications: [
          notification(),
          notification({ id: 'n2', title: 'WEBAPP-1 is overdue', type: 'TASK_OVERDUE', isRead: true, body: null }),
        ],
      },
      meta: { total: 2, page: 1, pageSize: 20, totalPages: 1, unreadCount: 1 },
    });
  });

  it('lists notifications with type badges and links', async () => {
    renderPage();

    expect(await screen.findByText('Marvin mentioned you on WEBAPP-2')).toBeInTheDocument();
    expect(screen.getByText('Mention')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText(/2 notifications/)).toBeInTheDocument();
    expect(screen.getByText(/1 unread/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Marvin mentioned you on WEBAPP-2' })).toHaveAttribute('href', '/tasks/t2');
  });

  it('filters to unread notifications', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Marvin mentioned you on WEBAPP-2');

    await user.click(screen.getByRole('button', { name: 'Unread' }));

    await waitFor(() => {
      const lastCall = mockedFetch.mock.calls.at(-1)?.[0];
      expect(lastCall?.unreadOnly).toBe(true);
    });
  });

  it('toggles a notification between read and unread', async () => {
    const user = userEvent.setup();
    mockedMarkRead.mockResolvedValue(null);
    renderPage();

    await screen.findByText('Marvin mentioned you on WEBAPP-2');
    await user.click(screen.getAllByRole('button', { name: 'Mark read' })[0]);

    expect(mockedMarkRead).toHaveBeenCalledWith('n1', true);
  });

  it('marks everything as read', async () => {
    const user = userEvent.setup();
    mockedMarkAll.mockResolvedValue({ updated: 1 });
    renderPage();

    await screen.findByText('Marvin mentioned you on WEBAPP-2');
    await user.click(screen.getByRole('button', { name: 'Mark all read' }));

    await waitFor(() => expect(mockedMarkAll).toHaveBeenCalled());
  });

  it('shows an empty state', async () => {
    mockedFetch.mockResolvedValue({ data: { notifications: [] }, meta: { total: 0, page: 1, pageSize: 20, unreadCount: 0 } });
    renderPage();

    expect(await screen.findByText('No notifications yet')).toBeInTheDocument();
  });
});
