import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { TaskFiltersBar } from '../components/tasks/TaskFiltersBar';
import { TaskTable } from '../components/tasks/TaskTable';
import { CheckSquareIcon } from '../components/ui/icons';
import { useMyTasks } from '../features/tasks/queries';
import type { TaskFilters } from '../features/tasks/types';
import { useDebounce } from '../hooks/useDebounce';

const PAGE_SIZE = 25;

export function MyTasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '');
  const debouncedSearch = useDebounce(searchInput, 350);
  const syncedQRef = useRef(searchParams.get('q') ?? '');

  const filters: TaskFilters = useMemo(() => {
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    return {
      q: debouncedSearch || undefined,
      status: status ? [status] : undefined,
      priority: priority ? [priority] : undefined,
      overdue: searchParams.get('overdue') === 'true' || undefined,
      blocked: searchParams.get('blocked') === 'true' || undefined,
      includeCompleted: searchParams.get('completed') === 'true' ? true : undefined,
      sort: searchParams.get('sort') ?? 'dueDate',
      page: Number(searchParams.get('page') ?? '1') || 1,
      pageSize: PAGE_SIZE,
    };
  }, [debouncedSearch, searchParams]);

  const tasks = useMyTasks(filters);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    const current = searchParams.get('q') ?? '';
    if (current !== debouncedSearch) {
      syncedQRef.current = debouncedSearch;
      setParam('q', debouncedSearch || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Resync the input when the URL changes externally (back/forward, links).
  useEffect(() => {
    const urlQ = searchParams.get('q') ?? '';
    if (urlQ !== syncedQRef.current) {
      syncedQRef.current = urlQ;
      setSearchInput(urlQ);
    }
  }, [searchParams]);

  const updateFilters = (partial: Partial<TaskFilters>) => {
    const next = new URLSearchParams(searchParams);
    const setList = (key: string, list?: string[]) => {
      if (list && list.length > 0) next.set(key, list[0]);
      else next.delete(key);
    };
    if ('status' in partial) setList('status', partial.status);
    if ('priority' in partial) setList('priority', partial.priority);
    if ('overdue' in partial) partial.overdue ? next.set('overdue', 'true') : next.delete('overdue');
    if ('blocked' in partial) partial.blocked ? next.set('blocked', 'true') : next.delete('blocked');
    if ('includeCompleted' in partial) partial.includeCompleted ? next.set('completed', 'true') : next.delete('completed');
    if ('sort' in partial && partial.sort) next.set('sort', partial.sort);
    next.delete('page');
    setSearchParams(next, { replace: true });
  };

  const items = tasks.data?.data.tasks ?? [];
  const totalPages = Number(tasks.data?.meta.totalPages ?? 1);
  const total = Number(tasks.data?.meta.total ?? items.length);
  const overdueCount = items.filter((task) => task.isOverdue).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-white">
          <CheckSquareIcon className="text-lg text-indigo-500" />
          My tasks
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {total} task{total === 1 ? '' : 's'} assigned to you
          {overdueCount > 0 && (
            <span className="ml-1 font-medium text-red-600 dark:text-red-400">· {overdueCount} overdue</span>
          )}
        </p>
      </div>

      <TaskFiltersBar
        filters={filters}
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        onChange={updateFilters}
        onReset={() => {
          setSearchInput('');
          setSearchParams({}, { replace: true });
        }}
        showAssignee={false}
        showScopeToggle={false}
      />

      <Card>
        <CardHeader title="Assigned work" description="Across every project you belong to" />
        {tasks.isLoading && (
          <CardBody className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardBody>
        )}
        {tasks.isError && (
          <CardBody>
            <ErrorState title="Could not load your tasks" description={tasks.error.message} onRetry={() => tasks.refetch()} />
          </CardBody>
        )}
        {!tasks.isLoading && !tasks.isError && items.length === 0 && (
          <CardBody>
            <EmptyState
              title="Nothing assigned to you"
              description="Tasks assigned to you will appear here, across all of your projects."
            />
          </CardBody>
        )}
        {items.length > 0 && <TaskTable tasks={items} showProject />}
        {items.length > 0 && (
          <CardBody className="border-t border-slate-100 dark:border-slate-800">
            <Pagination
              page={filters.page ?? 1}
              totalPages={totalPages}
              total={total}
              onPageChange={(page) => setParam('page', String(page))}
            />
          </CardBody>
        )}
      </Card>
    </div>
  );
}
