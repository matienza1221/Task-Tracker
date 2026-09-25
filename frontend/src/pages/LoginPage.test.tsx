import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';
import { fetchMe, loginRequest } from '../features/auth/api';
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
const mockedLogin = vi.mocked(loginRequest);

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

function renderLogin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<p>Dashboard home</p>} />
          <Route path="/change-password" element={<p>Change password screen</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    mockedFetchMe.mockRejectedValue(new ApiError('Authentication required.', 401, 'UNAUTHENTICATED'));
    mockedLogin.mockReset();
  });

  it('shows validation messages for missing input', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Email is required.')).toBeInTheDocument();
    expect(screen.getByText('Password is required.')).toBeInTheDocument();
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  it('validates the email format', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'whatever');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  it('submits credentials and navigates to the dashboard on success', async () => {
    mockedLogin.mockResolvedValue({ user: USER });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'dev@example.com');
    await user.type(screen.getByLabelText('Password'), 'Test_Password_123!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(mockedLogin).toHaveBeenCalled();
    });
    expect(mockedLogin.mock.calls[0]?.[0]).toEqual({ email: 'dev@example.com', password: 'Test_Password_123!' });
    expect(await screen.findByText('Dashboard home')).toBeInTheDocument();
  });

  it('sends users with a temporary password to the change-password screen', async () => {
    mockedLogin.mockResolvedValue({ user: { ...USER, mustChangePassword: true } });
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'dev@example.com');
    await user.type(screen.getByLabelText('Password'), 'Test_Password_123!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Change password screen')).toBeInTheDocument();
  });

  it('shows the server error message when credentials are rejected', async () => {
    mockedLogin.mockRejectedValue(new ApiError('Invalid email or password.', 401, 'INVALID_CREDENTIALS'));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'dev@example.com');
    await user.type(screen.getByLabelText('Password'), 'Wrong_Password_1!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  });

  it('shows the lockout message when the account is locked', async () => {
    mockedLogin.mockRejectedValue(
      new ApiError('This account is temporarily locked after too many failed sign-in attempts.', 429, 'ACCOUNT_LOCKED'),
    );
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'dev@example.com');
    await user.type(screen.getByLabelText('Password'), 'Wrong_Password_1!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily locked');
  });
});
