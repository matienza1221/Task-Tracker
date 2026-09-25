import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsPage } from './ReportsPage';
import type { ProjectAnalytics } from '../features/analytics/queries';

vi.mock('../features/analytics/queries', () => ({
  useProjectAnalytics: vi.fn(),
}));

vi.mock('../features/projects/queries', () => ({
  useProjects: () => ({
    data: {
      data: {
        projects: [
          {
            id: 'p1',
            code: 'DEV',
            name: 'Dev',
            description: null,
            status: { id: 's1', key: 'ACTIVE', name: 'Active', category: 'ACTIVE', color: '#22c55e' },
            priority: { id: 'pr1', key: 'MEDIUM', name: 'Medium', weight: 2, color: '#eab308' },
            startDate: null,
            targetDate: '2026-07-01',
            actualCompletionDate: null,
            manager: null,
            createdBy: null,
            progress: 60,
            progressWeighting: 'COUNT',
            isArchived: false,
            archivedAt: null,
            myRole: 'MANAGER',
            memberCount: 2,
            milestoneCount: 1,
            labelCount: 0,
            createdAt: '',
            updatedAt: '',
          },
        ],
      },
      meta: { total: 1 },
    },
  }),
}));

const { useProjectAnalytics } = await import('../features/analytics/queries');
const mockedAnalytics = vi.mocked(useProjectAnalytics);

const ANALYTICS: ProjectAnalytics = {
  project: {
    id: 'p1',
    code: 'DEV',
    name: 'Dev',
    progress: 60,
    startDate: '2026-06-01',
    targetDate: '2026-07-01',
    status: { name: 'Active', color: '#22c55e', category: 'ACTIVE' },
  },
  completion: { total: 10, done: 6, open: 3, cancelled: 1, overdue: 2, blocked: 1, unassigned: 2, donePercent: 60 },
  byStatus: [
    { id: 's1', key: 'DONE', name: 'Done', category: 'DONE', color: '#22c55e', count: 6 },
    { id: 's2', key: 'IN_PROGRESS', name: 'In Progress', category: 'IN_PROGRESS', color: '#3b82f6', count: 3 },
  ],
  byPriority: [
    { id: 'pr1', key: 'HIGH', name: 'High', color: '#f97316', count: 4 },
    { id: 'pr2', key: 'LOW', name: 'Low', color: '#38bdf8', count: 2 },
  ],
  byType: [{ id: 'ty1', key: 'FEATURE', name: 'Feature', color: '#6366f1', count: 7 }],
  byAssignee: [
    { user: { id: 'u1', displayName: 'Busy Dev', avatarUrl: null }, open: 2, done: 4, overdue: 1, estimatedHours: 20, actualHours: 8 },
    { user: null, open: 1, done: 2, overdue: 1, estimatedHours: 5, actualHours: 2 },
  ],
  createdTrend: [
    { date: '2026-06-01', count: 2 },
    { date: '2026-06-02', count: 3 },
  ],
  completedTrend: [
    { date: '2026-06-01', count: 1 },
    { date: '2026-06-02', count: 2 },
  ],
  burndown: [
    { date: '2026-06-01', remaining: 9, ideal: 9 },
    { date: '2026-06-02', remaining: 7, ideal: 6 },
  ],
  velocity: [{ weekStart: '2026-05-25', completed: 3 }],
  cycleTime: { averageDays: 4.5, sampleSize: 6 },
  windowDays: 30,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ReportsPage', () => {
  beforeEach(() => {
    mockedAnalytics.mockReset();
    mockedAnalytics.mockReturnValue({ data: ANALYTICS, isLoading: false, isError: false } as unknown as ReturnType<typeof useProjectAnalytics>);
  });

  it('renders KPIs from the analytics endpoint', () => {
    renderPage();

    expect(screen.getAllByText('60%').length).toBeGreaterThan(0);
    expect(screen.getByText('Open tasks')).toBeInTheDocument();
    expect(screen.getByText('Avg cycle time')).toBeInTheDocument();
    expect(screen.getByText('4.5d')).toBeInTheDocument();
    expect(screen.getByText(/6 completed task/)).toBeInTheDocument();
  });

  it('renders distributions, trends and the assignee table', () => {
    renderPage();

    expect(screen.getByRole('img', { name: /Done: 6, In Progress: 3/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /High: 4, Low: 2/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Tasks created per day/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Remaining tasks per day/ })).toBeInTheDocument();
    expect(screen.getByText('Busy Dev')).toBeInTheDocument();
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByText('20h / 8h')).toBeInTheDocument();
    expect(screen.getByText(/Week of 2026-05-25/)).toBeInTheDocument();
  });

  it('reloads analytics when the window changes', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText('Window'), '90');

    await waitFor(() => {
      const lastCall = mockedAnalytics.mock.calls.at(-1);
      expect(lastCall?.[1]).toBe(90);
    });
  });

  it('surfaces a retryable error state', () => {
    mockedAnalytics.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network down'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useProjectAnalytics>);

    renderPage();
    expect(screen.getByText('Could not load analytics')).toBeInTheDocument();
  });
});
