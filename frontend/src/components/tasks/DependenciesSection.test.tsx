import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DependenciesSection } from './DependenciesSection';
import type { Task } from '../../features/tasks/types';

const addMutate = vi.fn();
const removeMutate = vi.fn();

vi.mock('../../features/dependencies/queries', () => ({
  useDependencies: () => ({
    data: {
      blockedBy: [
        {
          id: 'b1',
          key: 'DEV-1',
          title: 'Design API',
          status: { name: 'In Progress', category: 'IN_PROGRESS', color: '#3b82f6' },
          project: { id: 'p1', code: 'DEV' },
          dueDate: '2026-08-01',
        },
      ],
      blocks: [
        {
          id: 'c1',
          key: 'DEV-5',
          title: 'Deploy',
          status: { name: 'To Do', category: 'TODO', color: '#8b5cf6' },
          project: { id: 'p1', code: 'DEV' },
          dueDate: null,
        },
      ],
    },
    isLoading: false,
  }),
  useAddDependency: () => ({ mutate: addMutate, isPending: false }),
  useRemoveDependency: () => ({ mutate: removeMutate, isPending: false }),
}));

vi.mock('../../features/tasks/queries', () => ({
  useProjectTasks: () => ({
    data: {
      data: {
        tasks: [
          { id: 'b1', displayKey: 'DEV-1', title: 'Design API' },
          { id: 'x1', displayKey: 'DEV-9', title: 'Candidate blocker' },
        ],
      },
      meta: { total: 2, page: 1, pageSize: 20 },
    },
  }),
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    key: 'DEV-2',
    displayKey: 'DEV-2',
    number: 2,
    title: 'Build client',
    description: null,
    project: { id: 'p1', code: 'DEV', name: 'Dev' },
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
    blockedBy: [
      {
        id: 'b1',
        key: 'DEV-1',
        title: 'Design API',
        status: { name: 'In Progress', category: 'IN_PROGRESS', color: '#3b82f6' },
        project: { id: 'p1', code: 'DEV' },
        dueDate: '2026-08-01',
      },
    ],
    isBlocked: true,
    subtaskCount: 0,
    completedSubtaskCount: 0,
    isOverdue: false,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderSection(canManage = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DependenciesSection task={makeTask()} projectId="p1" canManage={canManage} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DependenciesSection', () => {
  beforeEach(() => {
    addMutate.mockReset();
    removeMutate.mockReset();
  });

  it('shows blocking tasks, the tasks it blocks and a blocked warning', () => {
    renderSection();

    expect(screen.getByText('This task is blocked')).toBeInTheDocument();
    expect(screen.getByText('Waiting on 1 unfinished task')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Design API/ })).toHaveAttribute('href', '/tasks/b1');
    expect(screen.getByText('Blocks')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Deploy/ })).toHaveAttribute('href', '/tasks/c1');
  });

  it('adds a dependency through the search-and-pick flow', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.type(screen.getByLabelText('Add a blocking task'), 'candidate');
    await user.selectOptions(await screen.findByLabelText('Task'), 'x1');
    await user.click(screen.getByRole('button', { name: 'Add dependency' }));

    expect(addMutate).toHaveBeenCalledWith('x1', expect.anything());
  });

  it('removes a dependency from the blocked-by list', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(removeMutate).toHaveBeenCalledWith({ blockedTaskId: 't1', dependsOnTaskId: 'b1' }, expect.anything());
  });

  it('removes an edge from the blocks list with the right direction', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[1]);
    expect(removeMutate).toHaveBeenCalledWith({ blockedTaskId: 'c1', dependsOnTaskId: 't1' }, expect.anything());
  });

  it('hides editing controls from viewers', () => {
    renderSection(false);
    expect(screen.queryByLabelText('Add a blocking task')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('disables the picker until a search term is entered', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByLabelText('Task')).toBeDisabled());
  });
});
