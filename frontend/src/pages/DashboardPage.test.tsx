import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';
import { fetchMe } from '../features/auth/api';
import type { DashboardSummary } from '../features/dashboard/queries';
import type { Task } from '../features/tasks/types';

vi.mock('../features/auth/api', () => ({
  fetchMe: vi.fn(),
  loginRequest: vi.fn(),
  logoutRequest: vi.fn(),
  changePasswordRequest: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPasswordRequest: vi.fn(),
}));

vi.mock('../features/dashboard/queries', () => ({
  useDashboardSummary: vi.fn(),
}));

const { useDashboardSummary } = await import('../features/dashboard/queries');
const mockedSummary = vi.mocked(useDashboardSummary);

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    key: 'DEV-1',
    displayKey: 'DEV-1',
    number: 1,
    title: 'Convert portal',
    description: null,
    project: { id: 'p1', code: 'DEV', name: 'Dev' },
    parent: null,
    milestone: null,
    status: { id: 's1', key: 'IN_PROGRESS', name: 'In Progress', category: 'IN_PROGRESS', color: '#3b82f6' },
    priority: { id: 'pr1', key: 'HIGH', name: 'High', weight: 3, color: '#f97316' },
    type: { id: 'ty1', key: 'FEATURE', name: 'Feature', icon: 'sparkles', color: '#6366f1' },
    assignee: null,
    reporter: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    estimatedHours: null,
    actualHours: 0,
    progress: 40,
    progressMode: 'MANUAL',
    nextStep: null,
    verificationNote: null,
    codeReferences: [],
    labels: [],
    blockedBy: [],
    isBlocked: false,
    subtaskCount: 0,
    completedSubtaskCount: 0,
    isOverdue: false,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const SUMMARY: DashboardSummary = {
  projects: { total: 3, active: 2, planning: 1, onHold: 0, completed: 0, archived: 0, overdue: 1 },
  tasks: {
    total: 12,
    backlog: 3,
    todo: 2,
    inProgress: 4,
    inReview: 1,
    testing: 1,
    blocked: 1,
    done: 0,
    cancelled: 0,
    overdue: 2,
    dueToday: 1,
    dueThisWeek: 3,
    unassigned: 5,
    waitingOnDependencies: 1,
  },
  myWork: {
    open: 4,
    overdue: 1,
    dueThisWeek: 2,
    recentlyUpdated: [task()],
    recentlyCreated: [],
  },
  upcomingMilestones: [
    { id: 'm1', name: 'MVP Release', targetDate: '2026-07-01', status: 'PLANNED', project: { id: 'p1', code: 'DEV', name: 'Dev' } },
  ],
  recentProjects: [
    {
      id: 'p1',
      code: 'DEV',
      name: 'Dev',
      description: null,
      status: { id: 's1', key: 'ACTIVE', name: 'Active', category: 'ACTIVE', color: '#22c55e' },
      priority: { id: 'pr1', key: 'MEDIUM', name: 'Medium', weight: 2, color: '#eab308' },
      startDate: null,
      targetDate: null,
      actualCompletionDate: null,
      manager: null,
      createdBy: null,
      progress: 50,
      progressWeighting: 'COUNT',
      isArchived: false,
      archivedAt: null,
      myRole: 'MANAGER',
      memberCount: 1,
      milestoneCount: 1,
      labelCount: 0,
      createdAt: '',
      updatedAt: '',
    },
  ],
};

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(fetchMe).mockResolvedValue({
      user: {
        id: 'u1',
        email: 'admin@example.com',
        displayName: 'Admin User',
        avatarUrl: null,
        globalRole: 'ADMIN',
        timezone: 'Asia/Manila',
        mustChangePassword: false,
        lastLoginAt: null,
        permissions: [],
      },
    });
    mockedSummary.mockReset();
    mockedSummary.mockReturnValue({ data: SUMMARY, isLoading: false, isError: false } as unknown as ReturnType<typeof useDashboardSummary>);
  });

  it('renders project and task statistics from the summary endpoint', () => {
    renderDashboard();

    expect(screen.getByText(/3 projects · 12 open tasks/)).toBeInTheDocument();
    expect(screen.getByText('Active projects')).toBeInTheDocument();
    expect(screen.getByText('Overdue projects')).toBeInTheDocument();
    expect(screen.getByText('Blocked / waiting')).toBeInTheDocument();
    expect(screen.getByText('Completed projects')).toBeInTheDocument();
  });

  it('shows my work, milestones and recent projects', () => {
    renderDashboard();

    expect(screen.getByText('My work')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Convert portal/ })).toHaveAttribute('href', '/tasks/t1');
    expect(screen.getByRole('link', { name: /MVP Release/ })).toHaveAttribute('href', '/projects/p1?tab=milestones');
    expect(screen.getByRole('link', { name: /Dev/ })).toHaveAttribute('href', '/projects/p1');
    expect(screen.getByRole('img', { name: /Tasks by status/ })).toBeInTheDocument();
  });

  it('surfaces a retryable error state', () => {
    mockedSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network down'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useDashboardSummary>);

    renderDashboard();
    expect(screen.getByText('Could not load your dashboard')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
