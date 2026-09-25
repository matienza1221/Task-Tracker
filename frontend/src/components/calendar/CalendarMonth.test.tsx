import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarMonth } from './CalendarMonth';
import type { CalendarData } from '../../features/calendar/types';

vi.mock('../../features/calendar/queries', () => ({
  useCalendar: vi.fn(),
}));

const { useCalendar } = await import('../../features/calendar/queries');
const mockedUseCalendar = vi.mocked(useCalendar);

function task(overrides: Record<string, unknown>) {
  return {
    id: 't1',
    key: 'DEV-1',
    displayKey: 'DEV-1',
    number: 1,
    title: 'Ship the portal',
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

const DATA: CalendarData = {
  from: '2026-06-01',
  to: '2026-07-12',
  tasks: [
    task({ id: 't1', dueDate: '2026-06-10' }) as never,
    task({ id: 't2', key: 'DEV-2', displayKey: 'DEV-2', title: 'Kickoff', startDate: '2026-06-05', dueDate: '2026-06-20' }) as never,
    task({ id: 't3', key: 'DEV-3', displayKey: 'DEV-3', title: 'Overdue thing', dueDate: '2026-06-08', isOverdue: true }) as never,
  ],
  milestones: [
    {
      id: 'm1',
      name: 'MVP Release',
      targetDate: '2026-06-15',
      status: 'PLANNED',
      project: { id: 'p1', code: 'DEV', name: 'Dev' },
    },
  ],
  projects: [
    { id: 'p1', code: 'DEV', name: 'Dev', targetDate: '2026-06-30', status: { name: 'Active', color: '#22c55e', category: 'ACTIVE' } },
  ],
  truncated: false,
};

function renderCalendar(onMonthChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CalendarMonth
          month={new Date('2026-06-15T00:00:00.000Z')}
          onMonthChange={onMonthChange}
          filters={{ projectId: 'p1' }}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onMonthChange };
}

describe('CalendarMonth', () => {
  beforeEach(() => {
    mockedUseCalendar.mockReset();
    mockedUseCalendar.mockReturnValue({
      data: DATA,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCalendar>);
  });

  it('renders the month header, weekday ruler and scheduled events', () => {
    renderCalendar();

    expect(screen.getByText('June 2026')).toBeInTheDocument();
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByText(day)).toBeInTheDocument();
    }
    expect(screen.getByText(/DEV-1 Ship the portal/)).toBeInTheDocument();
    expect(screen.getByText(/DEV-3 Overdue thing/)).toBeInTheDocument();
    expect(screen.getByText(/DEV · MVP Release/)).toBeInTheDocument();
    expect(screen.getByText(/DEV target/)).toBeInTheDocument();
    expect(screen.getByText(/starts DEV-2/)).toBeInTheDocument();
  });

  it('navigates between months and back to today', async () => {
    const user = userEvent.setup();
    const { onMonthChange } = renderCalendar();

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(onMonthChange).toHaveBeenCalledTimes(1);
    const previous = onMonthChange.mock.calls[0][0] as Date;
    expect(previous.getMonth()).toBe(4); // May

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    const next = onMonthChange.mock.calls[1][0] as Date;
    expect(next.getMonth()).toBe(6); // July

    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(onMonthChange).toHaveBeenCalledTimes(3);
  });

  it('links events to the task, milestone and project pages', () => {
    renderCalendar();

    expect(screen.getByRole('link', { name: /DEV-1 Ship the portal/ })).toHaveAttribute('href', '/tasks/t1');
    expect(screen.getByRole('link', { name: /MVP Release/ })).toHaveAttribute('href', '/projects/p1?tab=milestones');
    expect(screen.getByRole('link', { name: /DEV target/ })).toHaveAttribute('href', '/projects/p1');
  });

  it('shows an empty state when the month has nothing scheduled', () => {
    mockedUseCalendar.mockReturnValue({
      data: { from: '', to: '', tasks: [], milestones: [], projects: [], truncated: false },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCalendar>);

    renderCalendar();
    expect(screen.getByText('Nothing scheduled this month')).toBeInTheDocument();
  });

  it('surfaces a retryable error state', () => {
    mockedUseCalendar.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network down'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useCalendar>);

    renderCalendar();
    expect(screen.getByText('Could not load the calendar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
