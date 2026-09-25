export type VocabularyKind = 'task-statuses' | 'task-priorities' | 'task-types' | 'project-statuses';

export interface VocabularyItem {
  id: string;
  key: string;
  name: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
  isDefault: boolean;
  isSystem: boolean;
  usageCount: number;
  category?: string;
  weight?: number;
  icon?: string;
}

export interface VocabularyCatalog {
  taskStatuses: VocabularyItem[];
  taskPriorities: VocabularyItem[];
  taskTypes: VocabularyItem[];
  projectStatuses: VocabularyItem[];
  categories: { taskStatuses: string[]; projectStatuses: string[] };
}

export const VOCABULARY_KIND_LABELS: Record<VocabularyKind, string> = {
  'task-statuses': 'Task statuses',
  'task-priorities': 'Priorities',
  'task-types': 'Task types',
  'project-statuses': 'Project statuses',
};
