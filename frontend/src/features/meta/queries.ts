import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/api/axios';
import type { Vocabularies } from './types';

export const fetchVocabularies = () => apiGet<Vocabularies>('/meta/vocabularies');

/** Statuses, priorities and types rarely change within a session. */
export function useVocabularies() {
  return useQuery({
    queryKey: ['meta', 'vocabularies'] as const,
    queryFn: fetchVocabularies,
    staleTime: 10 * 60_000,
  });
}
