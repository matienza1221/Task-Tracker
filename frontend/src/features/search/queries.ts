import { useQuery } from '@tanstack/react-query';
import { fetchSearch } from './api';

/** Debounce upstream; this hook expects an already-settled query. */
export function useGlobalSearch(query: string) {
  const term = query.trim();
  return useQuery({
    queryKey: ['search', term] as const,
    queryFn: () => fetchSearch(term),
    enabled: term.length >= 2,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}
