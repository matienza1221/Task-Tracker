import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequirePermission } from './RequirePermission';
import { fetchMe } from '../features/auth/api';
import type { AuthUser, GlobalRole } from '../features/auth/types';

vi.mock('../features/auth/api', () => ({
  fetchMe: vi.fn(),
  loginRequest: vi.fn(),
  logoutRequest: vi.fn(),
  changePasswordRequest: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPasswordRequest: vi.fn(),
}));

function makeUser(globalRole: GlobalRole, permissions: string[]): AuthUser {
  return {
    id: 'u1',
    email: 'user@example.com',
    displayName: 'Test User',
    avatarUrl: null,
    globalRole,
    timezone: 'Asia/Manila',
    mustChangePassword: false,
    lastLoginAt: null,
    permissions,
  };
}

function renderGuarded(permission: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RequirePermission permission={permission}>
          <p>Administration content</p>
        </RequirePermission>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RequirePermission', () => {
  beforeEach(() => {
    vi.mocked(fetchMe).mockReset();
  });

  it('renders children when the user holds the permission', async () => {
    vi.mocked(fetchMe).mockResolvedValue({ user: makeUser('ADMIN', ['user:manage']) });
    renderGuarded('user:manage');

    expect(await screen.findByText('Administration content')).toBeInTheDocument();
  });

  it('blocks users without the permission', async () => {
    vi.mocked(fetchMe).mockResolvedValue({ user: makeUser('DEVELOPER', ['project:view']) });
    renderGuarded('user:manage');

    expect(await screen.findByText('You do not have access to this page')).toBeInTheDocument();
    expect(screen.queryByText('Administration content')).not.toBeInTheDocument();
  });
});
