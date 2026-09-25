import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AdminVocabulariesPage } from './AdminVocabulariesPage';

vi.mock('../features/vocabularies/queries', () => ({
  useVocabularyCatalog: () => ({
    data: {
      taskStatuses: [
        {
          id: 's1',
          key: 'TODO',
          name: 'To Do',
          color: '#8b5cf6',
          sortOrder: 20,
          isActive: true,
          isDefault: true,
          isSystem: true,
          usageCount: 3,
          category: 'TODO',
        },
      ],
      taskPriorities: [
        {
          id: 'p1',
          key: 'HIGH',
          name: 'High',
          color: '#f97316',
          sortOrder: 20,
          isActive: true,
          isDefault: false,
          isSystem: true,
          usageCount: 1,
          weight: 3,
        },
      ],
      taskTypes: [
        {
          id: 't1',
          key: 'BUG',
          name: 'Bug',
          color: '#ef4444',
          sortOrder: 20,
          isActive: true,
          isDefault: false,
          isSystem: true,
          usageCount: 0,
          icon: 'bug',
        },
      ],
      projectStatuses: [
        {
          id: 'ps1',
          key: 'ACTIVE',
          name: 'Active',
          color: '#22c55e',
          sortOrder: 20,
          isActive: true,
          isDefault: false,
          isSystem: true,
          usageCount: 2,
          category: 'ACTIVE',
        },
      ],
      categories: {
        taskStatuses: ['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'TESTING', 'BLOCKED', 'DONE', 'CANCELLED'],
        projectStatuses: ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'],
      },
    },
    isLoading: false,
    isError: false,
  }),
  useCreateVocabularyItem: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateVocabularyItem: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteVocabularyItem: () => ({ mutate: vi.fn(), isPending: false }),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminVocabulariesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminVocabulariesPage', () => {
  it('renders every vocabulary section with usage counts', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /Vocabularies/ })).toBeInTheDocument();
    expect(screen.getByText('Task statuses')).toBeInTheDocument();
    expect(screen.getByText('Priorities')).toBeInTheDocument();
    expect(screen.getByText('Task types')).toBeInTheDocument();
    expect(screen.getByText('Project statuses')).toBeInTheDocument();

    expect(screen.getByLabelText('Name for To Do')).toHaveValue('To Do');
    expect(screen.getByLabelText('Weight for High')).toHaveValue(3);
    expect(screen.getByLabelText('Icon for Bug')).toHaveValue('bug');
    expect(screen.getAllByText('Default').length).toBeGreaterThan(1);
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });

  it('explains the category rule for statuses', () => {
    renderPage();
    expect(screen.getByText(/Categories control progress maths/)).toBeInTheDocument();
  });
});
