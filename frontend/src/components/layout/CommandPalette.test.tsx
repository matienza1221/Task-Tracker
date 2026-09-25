import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './CommandPalette';
import { fetchMe } from '../../features/auth/api';
import type { AuthUser } from '../../features/auth/types';

vi.mock('../../features/auth/api', () => ({
  fetchMe: vi.fn(),
  loginRequest: vi.fn(),
  logoutRequest: vi.fn(),
  changePasswordRequest: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPasswordRequest: vi.fn(),
}));

vi.mock('../../features/search/api', () => ({
  fetchSearch: vi.fn(),
}));

const { fetchSearch } = await import('../../features/search/api');
const mockedSearch = vi.mocked(fetchSearch);

const ADMIN: AuthUser = {
  id: 'u1',
  email: 'admin@example.com',
  displayName: 'Admin User',
  avatarUrl: null,
  globalRole: 'ADMIN',
  timezone: 'Asia/Manila',
  mustChangePassword: false,
  lastLoginAt: null,
  permissions: ['user:manage', 'vocabulary:manage'],
};

function LocationLabel() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

function renderPalette() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <LocationLabel />
                <CommandPalette />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.mocked(fetchMe).mockResolvedValue({ user: ADMIN });
    mockedSearch.mockReset();
    mockedSearch.mockResolvedValue({ tasks: [], projects: [] });
  });

  it('opens with Ctrl+K and lists navigation actions', async () => {
    const user = userEvent.setup();
    renderPalette();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.keyboard('{Control>}k{/Control}');

    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Go to my tasks/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Manage users/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Switch theme/ })).toBeInTheDocument();
  });

  it('filters actions as the user types and runs the highlighted one', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByLabelText('Search tasks, projects and actions'), 'settings');

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Go to settings/ })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Go to my tasks/ })).not.toBeInTheDocument();
    });

    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/settings'));
  });

  it('navigates with arrow keys', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.keyboard('{Control>}k{/Control}');
    await screen.findByRole('dialog');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/projects'));
  });

  it('searches tasks and projects and opens the selection', async () => {
    mockedSearch.mockResolvedValue({
      tasks: [
        {
          id: 't1',
          key: 'WEBAPP-1',
          displayKey: 'WEBAPP-1',
          number: 1,
          title: 'Convert monitoring portal',
          description: null,
          project: { id: 'p1', code: 'WEBAPP', name: 'Web App' },
          parent: null,
          milestone: null,
          status: { id: 's1', key: 'TODO', name: 'To Do', category: 'TODO', color: '#8b5cf6' },
          priority: { id: 'pr1', key: 'MEDIUM', name: 'Medium', weight: 2, color: '#eab308' },
          type: { id: 'ty1', key: 'FEATURE', name: 'Feature', icon: 'sparkles', color: '#6366f1' },
          assignee: null,
          reporter: null,
          startDate: null,
          dueDate: null,
          completedAt: null,
          estimatedHours: null,
          actualHours: 0,
          progress: 0,
          progressMode: 'MANUAL',
          nextStep: null,
          verificationNote: null,
          codeReferences: [],
          labels: [],
          subtaskCount: 0,
          completedSubtaskCount: 0,
          isOverdue: false,
    blockedBy: [],
    isBlocked: false,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      projects: [],
    });

    const user = userEvent.setup();
    renderPalette();

    await user.keyboard('{Control>}k{/Control}');
    await user.type(screen.getByLabelText('Search tasks, projects and actions'), 'monitoring');

    const option = await screen.findByRole('option', { name: /WEBAPP-1/ });
    expect(option).toHaveTextContent('Convert monitoring portal');

    await user.click(option);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/tasks/t1'));
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('hides administration actions from users without the permission', async () => {
    vi.mocked(fetchMe).mockResolvedValue({
      user: { ...ADMIN, globalRole: 'VIEWER', permissions: ['project:view'] },
    });
    const user = userEvent.setup();
    renderPalette();

    await user.keyboard('{Control>}k{/Control}');
    await screen.findByRole('dialog');

    expect(screen.queryByRole('option', { name: /Manage users/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Go to projects/ })).toBeInTheDocument();
  });
});
