import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api/axios';
import type { VocabularyItem, VocabularyCatalog, VocabularyKind } from './types';

export const fetchVocabularyCatalog = () => apiGet<VocabularyCatalog>('/admin/vocabularies');

export const createVocabularyItem = (
  kind: VocabularyKind,
  input: Partial<Pick<VocabularyItem, 'name' | 'color' | 'sortOrder' | 'category' | 'weight' | 'icon' | 'isDefault'>> & {
    name: string;
  },
) => apiPost<{ item: VocabularyItem }>(`/admin/vocabularies/${kind}`, input);

export const updateVocabularyItem = (
  kind: VocabularyKind,
  id: string,
  input: Partial<Pick<VocabularyItem, 'name' | 'color' | 'sortOrder' | 'category' | 'weight' | 'icon' | 'isDefault' | 'isActive'>>,
) => apiPatch<{ item: VocabularyItem }>(`/admin/vocabularies/${kind}/${id}`, input);

export const deleteVocabularyItem = (kind: VocabularyKind, id: string, hard = false) =>
  apiDelete<null>(`/admin/vocabularies/${kind}/${id}${hard ? '?hard=true' : ''}`);
