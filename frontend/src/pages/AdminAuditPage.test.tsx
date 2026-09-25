import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAuditPage } from './AdminAuditPage';
import type { AuditLogRow } from '../features/audit/queries';

vi.mock('../features/audit/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/audit/queries')>();
  return { ...actual, useAuditLogs: vi.fn(), useAuditActions: vi.fn() };
});

const { useAuditLogs, useAuditActions } = await import('../features/audit/queries');
const mockedLogs = vi.mocked(useAuditLogs);
const mockedActions = vi.mocked(useAuditActions);

const ROWS: AuditLogRow[] = [
  {
    id: 'a1',
    action: 'LOGIN_FAILED',
    actor: { id: null, email: 'intruder@example.com' },
    resourceType: null,
    resourceId: null,
    metadata: { reason: 'bad_password' },
    ip: '127.0.0.1',
    userAgent: 'test-agent',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'a2',
    action: 'TASK_DELETED',
    actor: { id: 'u1', email: 'admin@example.com' },
    resourceType: 'task',
    resourceId: '12345678-aaaa-bbbb-cccc-ddddeeeeffff',
    metadata: { key: 'DEV-9' },
    ip: '10.0.0.5',
    userAgent: 'test-agent',
    createdAt: new Date().toISOString(),
  },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminAuditPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminAuditPage', () => {
  beforeEach(() => {
    mockedLogs.mockReset();
    mockedActions.mockReset();
    mockedLogs.mockReturnValue({
      data: { data: { auditLogs: ROWS }, meta: { total: 2, page: 1, pageSize: 25, totalPages: 1 } },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAuditLogs>);
    mockedActions.mockReturnValue({
      data: { actions: ['LOGIN_FAILED', 'TASK_DELETED', 'USER_CREATED'] },
    } as unknown as ReturnType<typeof useAuditActions>);
  });

  it('lists events with actor, resource, metadata and IP', () => {
    renderPage();

    // The action names also appear in the filter dropdown, so scope to the table.
    const table = screen.getByRole('table');
    expect(within(table).getByText('LOGIN_FAILED')).toBeInTheDocument();
    expect(within(table).getByText('TASK_DELETED')).toBeInTheDocument();
    expect(screen.getByText('intruder@example.com')).toBeInTheDocument();
    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    expect(screen.getByText('127.0.0.1')).toBeInTheDocument();
    expect(screen.getByText(/12345678/)).toBeInTheDocument();
    expect(screen.getByText(/"key":"DEV-9"/)).toBeInTheDocument();
    expect(screen.getByText(/2 recorded events/)).toBeInTheDocument();
  });

  it('filters by action through the API', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText('Action'), 'TASK_DELETED');

    await waitFor(() => {
      const lastCall = mockedLogs.mock.calls.at(-1)?.[0];
      expect(lastCall?.action).toBe('TASK_DELETED');
      expect(lastCall?.page).toBe(1);
    });
  });

  it('exposes a CSV export link carrying the active filters', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText('Resource'), 'task');

    const link = screen.getByRole('link', { name: 'Export CSV' });
    expect(link).toHaveAttribute('href', expect.stringContaining('format=csv'));
    expect(link.getAttribute('href')).toContain('resourceType=task');
  });

  it('shows an empty state when nothing matches', () => {
    mockedLogs.mockReturnValue({
      data: { data: { auditLogs: [] }, meta: { total: 0, page: 1, pageSize: 25, totalPages: 1 } },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useAuditLogs>);

    renderPage();
    expect(screen.getByText('No matching events')).toBeInTheDocument();
  });

  it('surfaces a retryable error state', () => {
    mockedLogs.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Forbidden'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAuditLogs>);

    renderPage();
    expect(screen.getByText('Could not load the audit log')).toBeInTheDocument();
  });
});
