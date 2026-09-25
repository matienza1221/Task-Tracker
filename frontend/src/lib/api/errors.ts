import axios from 'axios';

export interface ValidationIssue {
  path: string;
  message: string;
  code?: string;
}

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: ValidationIssue[] };
}

/** Normalized client-side representation of an API failure. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ValidationIssue[];

  constructor(message: string, status: number, code: string, details?: ValidationIssue[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details ?? [];
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }

  get isValidationError(): boolean {
    return this.status === 422;
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isAxiosError(error)) {
    const response = error.response;
    if (!response) {
      return new ApiError(
        'Unable to reach the server. Check your connection and try again.',
        0,
        'NETWORK_ERROR',
      );
    }
    const body = response.data as ErrorEnvelope | undefined;
    return new ApiError(
      body?.error?.message ?? `Request failed with status ${response.status}.`,
      response.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.details,
    );
  }

  return new ApiError('An unexpected error occurred.', 500, 'INTERNAL_ERROR');
}

/** Coerces any thrown value into an ApiError (mutations type errors as Error). */
export function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : normalizeApiError(error);
}
