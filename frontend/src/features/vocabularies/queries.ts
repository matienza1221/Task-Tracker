import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createVocabularyItem,
  deleteVocabularyItem,
  fetchVocabularyCatalog,
  updateVocabularyItem,
} from './api';
import type { VocabularyKind } from './types';

export const vocabularyQueryKey = ['admin', 'vocabularies'] as const;

export function useVocabularyCatalog() {
  return useQuery({
    queryKey: vocabularyQueryKey,
    queryFn: fetchVocabularyCatalog,
    staleTime: 60_000,
  });
}

function useVocabularyMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vocabularyQueryKey });
      // Forms everywhere read the public vocabulary endpoint.
      queryClient.invalidateQueries({ queryKey: ['meta', 'vocabularies'] });
    },
  });
}

export function useCreateVocabularyItem() {
  return useVocabularyMutation(
    (input: { kind: VocabularyKind } & Parameters<typeof createVocabularyItem>[1]) =>
      createVocabularyItem(input.kind, input),
  );
}

export function useUpdateVocabularyItem() {
  return useVocabularyMutation(
    (input: { kind: VocabularyKind; id: string } & Parameters<typeof updateVocabularyItem>[2]) =>
      updateVocabularyItem(input.kind, input.id, input),
  );
}

export function useDeleteVocabularyItem() {
  return useVocabularyMutation((input: { kind: VocabularyKind; id: string; hard?: boolean }) =>
    deleteVocabularyItem(input.kind, input.id, input.hard ?? false),
  );
}
