import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamPage } from './TeamPage';
import type { WorkloadSummary } from '../features/workload/queries';

vi.mock('../features/workload/queries', () => ({
  useWorkload: vi.fn(),
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
            targetDate: null,
            actualCompletionDate: null,
            manager: null,
            createdBy: null,
            progress: 0,
            progressWeighting: 'COUNT',
            isArchived: false,
            archivedAt: null,
            myRole: 'MANAGER',
            memberCount: 1,
            milestoneCount: 0,
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

const { useWorkload } = await import('../features/workload/queries');
const mockedWorkload = vi.mocked(useWorkload);

const SUMMARY: WorkloadSummary = {
  rows: [
    {
      user: { id: 'u1', displayName: 'Busy Dev', email: 'busy@example.com', avatarUrl: null, globalRole: 'DEVELOPER' },
      activeTasks: 5,
      inProgressTasks: 2,
      blockedTasks: 1,
      overdueTasks: 2,
      completedTasks: 3,
      estimatedHours: 40,
      actualHours: 12,
      loadScore: 36,
      loadLevel: 'medium',
    },
    {
      user: { id: 'u2', displayName: 'Light Dev', email: 'light@example.com', avatarUrl: null, globalRole: 'DEVELOPER' },
      activeTasks: 1,
      inProgressTasks: 0,
      blockedTasks: 0,
      overdueTasks: 0,
      completedTasks: 1,
      estimatedHours: 4,
      actualHours: 1,
      loadScore: 4,
      loadLevel: 'low',
    },
  ],
  unassigned: { activeTasks: 2, overdueTasks: 1, estimatedHours: 6 },
  totals: { activeTasks: 6, overdueTasks: 2, completedTasks: 4, estimatedHours: 44, actualHours: 13 },
  projectId: null,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TeamPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TeamPage', () => {
  beforeEach(() => {
    mockedWorkload.mockReset();
    mockedWorkload.mockReturnValue({ data: SUMMARY, isLoading: false, isError: false } as unknown as ReturnType<typeof useWorkload>);
  });

  it('renders per-developer workload with counts, hours and load level', () => {
    renderPage();

    expect(screen.getByText('Busy Dev')).toBeInTheDocument();
    expect(screen.getByText('Light Dev')).toBeInTheDocument();
    expect(screen.getByText('40h / 12h')).toBeInTheDocument();
    expect(screen.getByText('Balanced')).toBeInTheDocument();
    expect(screen.getByText('Light')).toBeInTheDocument();
    // Totals strip
    expect(screen.getByText('Estimated hours')).toBeInTheDocument();
    expect(screen.getByText('44')).toBeInTheDocument();
  });

  it('reports unassigned work', () => {
    renderPage();
    expect(screen.getByText(/2\s*unassigned tasks/)).toBeInTheDocument();
  });

  it('requests a project-scoped workload when filtered', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText('Project'), 'p1');

    await waitFor(() => {
      const lastCall = mockedWorkload.mock.calls.at(-1)?.[0];
      expect(lastCall?.projectId).toBe('p1');
    });
  });

  it('surfaces a retryable error state', () => {
    mockedWorkload.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network down'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useWorkload>);

    renderPage();
    expect(screen.getByText('Could not load workload')).toBeInTheDocument();
  });
});
