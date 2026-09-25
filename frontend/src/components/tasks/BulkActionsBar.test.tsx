import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkActionsBar } from './BulkActionsBar';

const bulkMutate = vi.fn();

vi.mock('../../features/tasks/queries', () => ({
  useBulkUpdateTasks: () => ({ mutate: bulkMutate, isPending: false }),
}));

vi.mock('../../features/meta/queries', () => ({
  useVocabularies: () => ({
    data: {
      projectStatuses: [],
      taskStatuses: [
        { id: 's1', key: 'TODO', name: 'To Do', color: '#8b5cf6', isDefault: true, category: 'TODO' },
        { id: 's2', key: 'DONE', name: 'Done', color: '#22c55e', isDefault: false, category: 'DONE' },
      ],
      taskPriorities: [{ id: 'p1', key: 'HIGH', name: 'High', color: '#f97316', isDefault: false, weight: 3 }],
      taskTypes: [],
    },
  }),
}));

vi.mock('../../features/projects/queries', () => ({
  useMembers: () => ({
    data: {
      members: [
        {
          userId: 'u1',
          displayName: 'Dev Person',
          email: 'dev@example.com',
          avatarUrl: null,
          globalRole: 'DEVELOPER',
          projectRole: 'DEVELOPER',
          isProjectManager: false,
          addedBy: null,
          createdAt: '',
        },
      ],
    },
  }),
}));

function renderBar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BulkActionsBar projectId="p1" selectedIds={['t1', 't2']} onClear={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BulkActionsBar', () => {
  beforeEach(() => {
    bulkMutate.mockReset();
  });

  it('shows the selection count and applies a status change', async () => {
    const user = userEvent.setup();
    renderBar();

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Set status'), 's2');
    await user.click(screen.getAllByRole('button', { name: 'Apply' })[0]);

    expect(bulkMutate).toHaveBeenCalledWith(
      { taskIds: ['t1', 't2'], action: 'set-status', statusId: 's2' },
      expect.anything(),
    );
  });

  it('applies a priority change', async () => {
    const user = userEvent.setup();
    renderBar();

    await user.selectOptions(screen.getByLabelText('Set priority'), 'p1');
    await user.click(screen.getAllByRole('button', { name: 'Apply' })[1]);

    expect(bulkMutate).toHaveBeenCalledWith(
      { taskIds: ['t1', 't2'], action: 'set-priority', priorityId: 'p1' },
      expect.anything(),
    );
  });

  it('unassigns through the sentinel option', async () => {
    const user = userEvent.setup();
    renderBar();

    await user.selectOptions(screen.getByLabelText('Set assignee'), '__unassigned__');
    await user.click(screen.getAllByRole('button', { name: 'Apply' })[2]);

    expect(bulkMutate).toHaveBeenCalledWith(
      { taskIds: ['t1', 't2'], action: 'set-assignee', assigneeId: null },
      expect.anything(),
    );
  });

  it('deletes after confirmation', async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole('button', { name: 'Delete selected' }));
    await user.click(screen.getByRole('button', { name: 'Delete tasks' }));

    expect(bulkMutate).toHaveBeenCalledWith({ taskIds: ['t1', 't2'], action: 'delete' }, expect.anything());
  });

  it('disables apply buttons until a value is chosen', () => {
    renderBar();
    for (const button of screen.getAllByRole('button', { name: 'Apply' })) {
      expect(button).toBeDisabled();
    }
  });
});
