import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './errors';

/**
 * Server-state configuration. Mutations never retry automatically (writes must
 * be explicit); queries retry once for transient failures but never for 4xx.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;        return failureCount < 1;
      },
    },
    mutations: { retry: false },
  },
});
