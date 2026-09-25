import axios, { type AxiosRequestConfig } from 'axios';
import { ApiError, normalizeApiError } from './errors';

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  message?: string;
  meta?: Record<string, unknown>;
}

export const CSRF_COOKIE_NAME = 'tracker_csrf';
export const UNAUTHORIZED_EVENT = 'tracker:unauthorized';

/**
 * Base URL comes from the environment (VITE_API_URL, default "/api"); the API
 * URL is never hardcoded. Cookies carry the session; the CSRF token is sent as
 * a header for every state-changing request (see middleware/csrf.ts).
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  timeout: 20_000,
  headers: { Accept: 'application/json' },
});

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

api.interceptors.request.use((config) => {
  const method = (config.method ?? 'get').toUpperCase();

  if (!SAFE_METHODS.has(method)) {
    const token = readCookie(CSRF_COOKIE_NAME);
    if (token) config.headers.set('X-CSRF-Token', token);
  }

  const requestId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `req-${Date.now()}`;
  config.headers.set('X-Request-Id', requestId);

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const normalized = normalizeApiError(error);
    const url = axios.isAxiosError(error) ? (error.config?.url ?? '') : '';

    // A 401 on a non-auth endpoint means the session ended: notify the app shell.
    if (normalized.status === 401 && !url.startsWith('/auth/login') && !url.startsWith('/auth/me')) {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }

    return Promise.reject(normalized);
  },
);

export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.get<SuccessEnvelope<T>>(url, config);
  return response.data.data;
}

/** Like apiGet but also returns list metadata (pagination). */
export async function apiGetEnvelope<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<{ data: T; meta: Record<string, unknown> }> {
  const response = await api.get<SuccessEnvelope<T>>(url, config);
  return { data: response.data.data, meta: response.data.meta ?? {} };
}

export async function apiPost<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.post<SuccessEnvelope<T>>(url, body, config);
  return response.data.data;
}

export async function apiPatch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.patch<SuccessEnvelope<T>>(url, body, config);
  return response.data.data;
}

export async function apiDelete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await api.delete<SuccessEnvelope<T>>(url, config);
  return response.data.data;
}

export { ApiError };
