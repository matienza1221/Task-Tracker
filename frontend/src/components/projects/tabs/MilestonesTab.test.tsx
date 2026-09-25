import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MilestonesTab } from './MilestonesTab';
import type { Project } from '../../../features/projects/types';

vi.mock('../../../features/projects/queries', () => ({
  useMilestones: () => ({
    data: {
      milestones: [
        {
          id: 'm1',
          projectId: 'p1',
          name: 'MVP Release',
          description: 'Ship the portal',
          targetDate: '2026-10-15',
          status: 'IN_PROGRESS',
          completedAt: null,
          sortOrder: 0,
          taskCount: 4,
          completedTaskCount: 3,
          overdueTaskCount: 1,
          progress: 75,
          createdAt: '',
          updatedAt: '',
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
  useCreateMilestone: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateMilestone: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteMilestone: () => ({ mutate: vi.fn(), isPending: false }),
}));

const PROJECT = {
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
} as Project;

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MilestonesTab project={PROJECT} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MilestonesTab', () => {
  it('shows milestone progress derived from linked tasks', () => {
    renderTab();

    expect(screen.getByText('MVP Release')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
    expect(screen.getByText('3/4 linked tasks done')).toBeInTheDocument();
    expect(screen.getByText('1 overdue')).toBeInTheDocument();
  });

  it('offers management controls to managers', () => {
    renderTab();
    expect(screen.getByRole('button', { name: 'New milestone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
});
