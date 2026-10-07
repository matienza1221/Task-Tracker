import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MyTasksPage } from './MyTasksPage';
import type { Task } from '../features/tasks/types';

vi.mock('../features/tasks/api', () => ({
  fetchProjectTasks: vi.fn(),
  fetchMyTasks: vi.fn(),
  fetchTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateTaskAssignee: vi.fn(),
  createSubtask: vi.fn(),
  deleteTask: vi.fn(),
  fetchTaskActivity: vi.fn(),
}));

vi.mock('../features/projects/queries', () => ({
  useProjects: () => ({
    data: {
      data: {
        projects: [
          { id: 'p1', code: 'WEBAPP', name: 'Web App' },
          { id: 'p2', code: 'MOBILE', name: 'Mobile App' },
        ],
      },
      meta: { total: 2 },
    },
    isLoading: false,
  }),
}));

vi.mock('../features/meta/queries', () => ({
  useVocabularies: () => ({
    data: {
      projectStatuses: [],
      taskStatuses: [
        { id: 's1', key: 'IN_PROGRESS', name: 'In Progress', color: '#3b82f6', isDefault: false, category: 'IN_PROGRESS' },
        { id: 's2', key: 'DONE', name: 'Done', color: '#22c55e', isDefault: false, category: 'DONE' },
      ],
      taskPriorities: [{ id: 'p1', key: 'HIGH', name: 'High', color: '#f97316', isDefault: false, weight: 3 }],
      taskTypes: [],
    },
    isLoading: false,
  }),
}));

const { fetchMyTasks } = await import('../features/tasks/api');
const mockedFetchMyTasks = vi.mocked(fetchMyTasks);

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    key: 'WEBAPP-1',
    displayKey: 'WEBAPP-1',
    number: 1,
    title: 'Fix login redirect',
    description: null,
    project: { id: 'p1', code: 'WEBAPP', name: 'Web App' },
    parent: null,
    milestone: null,
    status: { id: 's1', key: 'IN_PROGRESS', name: 'In Progress', category: 'IN_PROGRESS', color: '#3b82f6' },
    priority: { id: 'p1', key: 'HIGH', name: 'High', weight: 3, color: '#f97316' },
    type: { id: 'ty1', key: 'BUG', name: 'Bug', icon: 'bug', color: '#ef4444' },
    assignee: { id: 'u1', displayName: 'Me', email: 'me@example.com', avatarUrl: null },
    reporter: null,
    startDate: null,
    dueDate: '2026-05-01',
    completedAt: null,
    estimatedHours: null,
    actualHours: 0,
    progress: 20,
    progressMode: 'MANUAL',
    nextStep: null,
    verificationNote: null,
    codeReferences: [],
    labels: [],
    subtaskCount: 0,
    completedSubtaskCount: 0,
    isOverdue: true,
    blockedBy: [],
    isBlocked: false,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderPage(initialEntry = '/my-tasks') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <MyTasksPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MyTasksPage', () => {
  beforeEach(() => {
    mockedFetchMyTasks.mockReset();
    mockedFetchMyTasks.mockResolvedValue({
      data: { tasks: [makeTask()] },
      meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    });
  });

  it('lists tasks assigned to the caller with project context and overdue count', async () => {
    renderPage();

    expect(await screen.findByText('Fix login redirect')).toBeInTheDocument();
    expect(screen.getByText('WEBAPP-1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'WEBAPP' })).toBeInTheDocument();
    expect(screen.getByText('1 task assigned to you')).toBeInTheDocument();
    expect(screen.getByText('· 1 overdue')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is assigned', async () => {
    mockedFetchMyTasks.mockResolvedValue({
      data: { tasks: [] },
      meta: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
    });
    renderPage();

    expect(await screen.findByText('Nothing assigned to you')).toBeInTheDocument();
  });

  it('renders a tab per project and filters the request when one is selected', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Fix login redirect');

    expect(screen.getByRole('tab', { name: 'All projects' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'WEBAPP' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'MOBILE' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'MOBILE' }));

    await waitFor(() => {
      const lastCall = mockedFetchMyTasks.mock.calls.at(-1)?.[0];
      expect(lastCall?.projectId).toBe('p2');
    });
    expect(screen.getByRole('tab', { name: 'MOBILE' })).toHaveAttribute('aria-selected', 'true');
  });

  it('reads the selected project from the URL', async () => {
    renderPage('/my-tasks?project=p1');

    await waitFor(() => {
      const lastCall = mockedFetchMyTasks.mock.calls.at(-1)?.[0];
      expect(lastCall?.projectId).toBe('p1');
    });
    expect(screen.getByRole('tab', { name: 'WEBAPP' })).toHaveAttribute('aria-selected', 'true');
  });

  it('applies status filters to the request', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Fix login redirect');

    await user.selectOptions(screen.getByLabelText('Status'), 'DONE');

    await waitFor(() => {
      const lastCall = mockedFetchMyTasks.mock.calls.at(-1)?.[0];
      expect(lastCall?.status).toEqual(['DONE']);
    });
  });

  it('requests the overdue filter when toggled', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Fix login redirect');

    await user.click(screen.getByLabelText('Overdue only'));

    await waitFor(() => {
      const lastCall = mockedFetchMyTasks.mock.calls.at(-1)?.[0];
      expect(lastCall?.overdue).toBe(true);
    });
  });

  it('surfaces a retryable error state', async () => {
    mockedFetchMyTasks.mockRejectedValue(new Error('Network down'));
    renderPage();

    expect(await screen.findByText('Could not load your tasks')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
