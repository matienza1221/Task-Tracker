export interface DependencyRef {
  id: string;
  key: string;
  title: string;
  status: { name: string; category: string; color: string };
  project: { id: string; code: string };
  dueDate: string | null;
}

export interface TaskDependencies {
  blockedBy: DependencyRef[];
  blocks: DependencyRef[];
}

export const UNRESOLVED_CATEGORIES = ['DONE', 'CANCELLED'];

export function unresolvedBlockers(blockedBy: DependencyRef[]): DependencyRef[] {
  return blockedBy.filter((dependency) => !UNRESOLVED_CATEGORIES.includes(dependency.status.category));
}
