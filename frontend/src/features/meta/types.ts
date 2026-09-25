export interface VocabularyOption {
  id: string;
  key: string;
  name: string;
  color: string;
  isDefault: boolean;
  category?: string;
  weight?: number;
  icon?: string;
}

export interface Vocabularies {
  projectStatuses: VocabularyOption[];
  taskStatuses: VocabularyOption[];
  taskPriorities: VocabularyOption[];
  taskTypes: VocabularyOption[];
}
