import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TimelineView } from './TimelineView';
import type { TimelineData } from '../../features/timeline/queries';
import type { Task } from '../../features/tasks/types';

function task(overrides: Partial<Task>): Task {
  return {
    id: 't1',
    key: 'DEV-1',
    displayKey: 'DEV-1',
    number: 1,
    title: 'Scheduled work',
    description: null,
    project: { id: 'p1', code: 'DEV', name: 'Dev' },
    parent: null,
    milestone: null,
    status: { id: 's1', key: 'IN_PROGRESS', name: 'In Progress', category: 'IN_PROGRESS', color: '#3b82f6' },
    priority: { id: 'pr1', key: 'HIGH', name: 'High', weight: 3, color: '#f97316' },
    type: { id: 'ty1', key: 'FEATURE', name: 'Feature', icon: 'sparkles', color: '#6366f1' },
    assignee: { id: 'u1', displayName: 'Dev Person', email: 'dev@example.com', avatarUrl: null },
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

const DATA: TimelineData = {
  project: { id: 'p1', code: 'DEV', name: 'Dev', startDate: '2026-06-01', targetDate: '2026-06-30' },
  milestones: [
    {
      id: 'm1',
      projectId: 'p1',
      name: 'MVP',
      description: null,
      targetDate: '2026-06-15',
      status: 'PLANNED',
      completedAt: null,
      sortOrder: 0,
      taskCount: 1,
      completedTaskCount: 0,
      overdueTaskCount: 0,
      progress: 50,
      createdAt: '',
      updatedAt: '',
    },
  ],
  tasks: [
    task({ id: 't1', startDate: '2026-06-02', dueDate: '2026-06-10', title: 'Scheduled work' }),
    task({
      id: 't2',
      key: 'DEV-2',
      displayKey: 'DEV-2',
      title: 'Blocked work',
      startDate: '2026-06-12',
      dueDate: '2026-06-20',
      isBlocked: true,
      blockedBy: [
        {
          id: 'b1',
          key: 'DEV-9',
          title: 'Dependency',
          status: { name: 'In Progress', category: 'IN_PROGRESS', color: '#3b82f6' },
          project: { id: 'p1', code: 'DEV' },
          dueDate: null,
        },
      ],
    }),
    task({ id: 't3', key: 'DEV-3', displayKey: 'DEV-3', title: 'Unscheduled work', startDate: null, dueDate: null }),
  ],
  truncated: false,
};

function renderTimeline(data: TimelineData = DATA) {
  return render(
    <MemoryRouter>
      <TimelineView data={data} />
    </MemoryRouter>,
  );
}

describe('TimelineView', () => {
  it('renders a bar per scheduled task with progress and a milestone marker', () => {
    renderTimeline();

    expect(screen.getByText('Scheduled work')).toBeInTheDocument();
    expect(screen.getByText('Blocked work')).toBeInTheDocument();
    expect(screen.getByText('◆ MVP')).toBeInTheDocument();
    expect(screen.getAllByText('40%').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Scheduled work/ })).toHaveAttribute('href', '/tasks/t1');
  });

  it('lists tasks without dates as unscheduled instead of hiding them', () => {
    renderTimeline();

    expect(screen.getByText('Unscheduled (1)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Unscheduled work/ })).toHaveAttribute('href', '/tasks/t3');
  });

  it('flags blocked tasks on the timeline', () => {
    renderTimeline();
    expect(screen.getByText('Waiting on DEV-9')).toBeInTheDocument();
  });

  it('renders the month ruler and legend', () => {
    renderTimeline();
    expect(screen.getByText('Jun 2026')).toBeInTheDocument();
    expect(screen.getByText(/Window:/)).toBeInTheDocument();
    expect(screen.getByText('dashed red line = today')).toBeInTheDocument();
  });

  it('shows an empty state when there are no tasks at all', () => {
    renderTimeline({ ...DATA, tasks: [], milestones: [] });
    expect(screen.getByText('Nothing to plot yet')).toBeInTheDocument();
  });
});
