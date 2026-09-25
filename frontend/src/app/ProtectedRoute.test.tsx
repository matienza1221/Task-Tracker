import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import { fetchMe } from '../features/auth/api';
import { ApiError } from '../lib/api/errors';
import type { AuthUser } from '../features/auth/types';

vi.mock('../features/auth/api', () => ({
  fetchMe: vi.fn(),
  loginRequest: vi.fn(),
  logoutRequest: vi.fn(),
  changePasswordRequest: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPasswordRequest: vi.fn(),
}));

const mockedFetchMe = vi.mocked(fetchMe);

const USER: AuthUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'dev@example.com',
  displayName: 'Dev User',
  avatarUrl: null,
  globalRole: 'DEVELOPER',
  timezone: 'Asia/Manila',
  mustChangePassword: false,
  lastLoginAt: null,
  permissions: ['task:view'],
};

function renderGuarded() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/secret']}>
        <Routes>
          <Route path="/login" element={<p>Login screen</p>} />
          <Route path="/change-password" element={<p>Change password screen</p>} />
          <Route
            path="/secret"
            element={
              <ProtectedRoute>
                <p>Secret content</p>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockedFetchMe.mockReset();
  });

  it('redirects unauthenticated visitors to the login screen', async () => {
    mockedFetchMe.mockRejectedValue(new ApiError('Authentication required.', 401, 'UNAUTHENTICATED'));
    renderGuarded();

    expect(await screen.findByText('Login screen')).toBeInTheDocument();
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument();
  });

  it('renders children for an authenticated user', async () => {
    mockedFetchMe.mockResolvedValue({ user: USER });
    renderGuarded();

    expect(await screen.findByText('Secret content')).toBeInTheDocument();
  });

  it('forces a password change before any other screen', async () => {
    mockedFetchMe.mockResolvedValue({ user: { ...USER, mustChangePassword: true } });
    renderGuarded();

    expect(await screen.findByText('Change password screen')).toBeInTheDocument();
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument();
  });
});
