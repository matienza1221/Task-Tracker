import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationBell } from './NotificationBell';
import type { AppNotification } from '../../features/notifications/types';

vi.mock('../../features/notifications/api', () => ({
  fetchNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

const { fetchNotifications, markNotificationRead, markAllNotificationsRead } = await import(
  '../../features/notifications/api'
);
const mockedFetch = vi.mocked(fetchNotifications);
const mockedMarkRead = vi.mocked(markNotificationRead);
const mockedMarkAll = vi.mocked(markAllNotificationsRead);

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n1',
    type: 'TASK_ASSIGNED',
    title: 'You were assigned WEBAPP-1',
    body: 'Convert monitoring portal',
    entityType: 'task',
    entityId: 't1',
    projectId: 'p1',
    taskId: 't1',
    isRead: false,
    readAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function LocationLabel() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

function renderBell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <LocationLabel />
                <NotificationBell />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NotificationBell', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedMarkRead.mockReset();
    mockedMarkAll.mockReset();
    mockedFetch.mockResolvedValue({
      data: { notifications: [notification(), notification({ id: 'n2', title: 'Overdue', type: 'TASK_OVERDUE', taskId: null, isRead: true })] },
      meta: { total: 2, page: 1, pageSize: 8, unreadCount: 3 },
    });
  });

  it('shows the unread badge with a capped count', async () => {
    renderBell();
    expect(await screen.findByLabelText('Notifications, 3 unread')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('opens the dropdown with recent notifications', async () => {
    const user = userEvent.setup();
    renderBell();

    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    expect(await screen.findByText('You were assigned WEBAPP-1')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('marks a notification read and navigates to the task', async () => {
    const user = userEvent.setup();
    mockedMarkRead.mockResolvedValue(null);
    renderBell();

    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    await user.click(await screen.findByText('You were assigned WEBAPP-1'));

    expect(mockedMarkRead).toHaveBeenCalledWith('n1', true);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/tasks/t1'));
  });

  it('marks everything as read', async () => {
    const user = userEvent.setup();
    mockedMarkAll.mockResolvedValue({ updated: 3 });
    renderBell();

    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    await user.click(screen.getByRole('button', { name: 'Mark all read' }));

    await waitFor(() => expect(mockedMarkAll).toHaveBeenCalled());
  });

  it('renders an empty state when there is nothing to show', async () => {
    mockedFetch.mockResolvedValue({ data: { notifications: [] }, meta: { total: 0, page: 1, pageSize: 8, unreadCount: 0 } });
    const user = userEvent.setup();
    renderBell();

    await user.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(await screen.findByText('You have no notifications.')).toBeInTheDocument();
  });
});
