import type { BoardColumn, Task, TaskFilters } from './types';

export interface DropTarget {
  statusId: string;
  targetIndex: number;
}

/**
 * Resolves a drag end event into a server move payload.
 *
 * dnd-kit reports the item under the pointer as either a card id or a column
 * droppable id (`column:<statusId>`). The server inserts the task into the
 * target column after removing it, so the index is computed against the
 * siblings *excluding* the dragged card — the same semantics as `arrayMove`.
 */
export function resolveDropTarget(columns: BoardColumn[], activeId: string, overId: string): DropTarget | null {
  const activeColumn = columns.find((column) => column.tasks.some((task) => task.id === activeId));
  if (!activeColumn) return null;

  if (overId.startsWith('column:')) {
    const statusId = overId.slice('column:'.length);
    const target = columns.find((column) => column.status.id === statusId);
    if (!target) return null;
    return { statusId, targetIndex: target.tasks.filter((task) => task.id !== activeId).length };
  }

  const overColumn = columns.find((column) => column.tasks.some((task) => task.id === overId));
  if (!overColumn) return null;

  const siblings = overColumn.tasks.filter((task) => task.id !== activeId);
  const index = siblings.findIndex((task) => task.id === overId);
  return { statusId: overColumn.status.id, targetIndex: index === -1 ? siblings.length : index };
}

/**
 * Applies a move to the cached board so the card lands where the user dropped
 * it before the server answers. Rollback restores the previous snapshot.
 */
export function applyOptimisticMove(
  columns: BoardColumn[],
  input: { taskId: string; statusId: string; targetIndex: number },
): BoardColumn[] {
  let moved: Task | undefined;
  const withoutTask = columns.map((column) => ({
    ...column,
    tasks: column.tasks.filter((task) => {
      if (task.id === input.taskId) {
        moved = task;
        return false;
      }
      return true;
    }),
  }));
  if (!moved) return columns;

  return withoutTask.map((column) => {
    if (column.status.id !== input.statusId) return column;
    const tasks = [...column.tasks];
    const index = Math.max(0, Math.min(input.targetIndex, tasks.length));
    tasks.splice(index, 0, { ...moved!, status: { ...moved!.status, id: column.status.id } });
    return { ...column, tasks };
  });
}

export function findTask(columns: BoardColumn[], taskId: string): Task | undefined {
  for (const column of columns) {
    const task = column.tasks.find((item) => item.id === taskId);
    if (task) return task;
  }
  return undefined;
}

export function totalTasks(columns: BoardColumn[]): number {
  return columns.reduce((sum, column) => sum + column.tasks.length, 0);
}

/** Serialises filters into URL search params so views are shareable. */
export function filtersToSearchParams(filters: TaskFilters): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  };
  const setList = (key: string, list?: string[]) => {
    if (list && list.length > 0) params.set(key, list[0]);
  };
  set('q', filters.q);
  setList('status', filters.status);
  setList('priority', filters.priority);
  setList('assignee', filters.assignee);
  setList('label', filters.label);
  setList('milestone', filters.milestone);
  set('type', filters.type?.[0]);
  if (filters.overdue) params.set('overdue', 'true');
  if (filters.blocked) params.set('blocked', 'true');
  if (filters.scope === 'mine') params.set('mine', 'true');
  if (filters.includeCompleted) params.set('completed', 'true');
  set('dueFrom', filters.dueFrom);
  set('dueTo', filters.dueTo);
  set('sort', filters.sort);
  return params;
}

/** Rebuilds the filter object stored in a saved view. */
export function searchParamsToFilters(params: URLSearchParams): TaskFilters {
  const list = (key: string) => {
    const value = params.get(key);
    return value ? [value] : undefined;
  };
  return {
    q: params.get('q') ?? undefined,
    status: list('status'),
    priority: list('priority'),
    assignee: list('assignee'),
    label: list('label'),
    milestone: list('milestone'),
    type: list('type'),
    overdue: params.get('overdue') === 'true' || undefined,
    blocked: params.get('blocked') === 'true' || undefined,
    scope: params.get('mine') === 'true' ? 'mine' : undefined,
    includeCompleted: params.get('completed') === 'true' ? true : undefined,
    dueFrom: params.get('dueFrom') ?? undefined,
    dueTo: params.get('dueTo') ?? undefined,
    sort: params.get('sort') ?? undefined,
  };
}
