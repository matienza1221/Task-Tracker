import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SavedViewsBar } from './SavedViewsBar';

const removeMutate = vi.fn();
const createMutate = vi.fn();

vi.mock('../../features/projects/queries', () => ({
  useSavedViews: () => ({
    data: {
      savedViews: [
        {
          id: 'v1',
          projectId: 'p1',
          name: 'My High Priority Tasks',
          scope: 'PROJECT',
          filters: { priority: ['HIGH'], status: ['IN_PROGRESS'] },
          isDefault: true,
          isOwner: true,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'v2',
          projectId: 'p1',
          name: 'Overdue',
          scope: 'PROJECT',
          filters: { overdue: true },
          isDefault: false,
          isOwner: true,
          createdAt: '',
          updatedAt: '',
        },
      ],
    },
  }),
  useSavedViewMutations: () => ({
    create: { mutate: createMutate, isPending: false },
    remove: { mutate: removeMutate, isPending: false },
  }),
}));

function renderBar(onApply = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SavedViewsBar projectId="p1" currentFilters={{ status: ['TODO'] }} onApply={onApply} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onApply };
}

describe('SavedViewsBar', () => {
  beforeEach(() => {
    removeMutate.mockReset();
    createMutate.mockReset();
  });

  it('lists saved views and applies one on click', async () => {
    const user = userEvent.setup();
    const { onApply } = renderBar();

    expect(screen.getByText(/My High Priority Tasks/)).toBeInTheDocument();
    await user.click(screen.getByText(/My High Priority Tasks/));

    expect(onApply).toHaveBeenCalledWith({ priority: ['HIGH'], status: ['IN_PROGRESS'] }, 'v1');
  });

  it('deletes a view', async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByLabelText('Delete saved view Overdue'));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete view' }));
    expect(removeMutate).toHaveBeenCalledWith('v2', expect.anything());
  });

  it('saves the current filters as a new view', async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole('button', { name: 'Save current view' }));
    await user.type(screen.getByLabelText('View name'), 'My TODO list');
    await user.click(screen.getByRole('button', { name: 'Save view' }));

    await waitFor(() => expect(createMutate).toHaveBeenCalled());
    const [payload] = createMutate.mock.calls[0];
    expect(payload).toMatchObject({ name: 'My TODO list', filters: { status: ['TODO'] }, isDefault: false });
  });

  it('requires a name before saving', async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole('button', { name: 'Save current view' }));
    await user.click(screen.getByRole('button', { name: 'Save view' }));

    expect(createMutate).not.toHaveBeenCalled();
  });
});
