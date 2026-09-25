import { apiGet, apiPost } from '../../lib/api/axios';
import type { UserPayload } from './types';

export const fetchMe = () => apiGet<UserPayload>('/auth/me');

export const loginRequest = (input: { email: string; password: string }) =>
  apiPost<UserPayload>('/auth/login', input);

export const logoutRequest = () => apiPost<null>('/auth/logout');

export const changePasswordRequest = (input: { currentPassword: string; newPassword: string }) =>
  apiPost<null>('/auth/password/change', input);

export const requestPasswordReset = (email: string) => apiPost<null>('/auth/password/forgot', { email });

export const resetPasswordRequest = (input: { token: string; newPassword: string }) =>
  apiPost<null>('/auth/password/reset', input);
