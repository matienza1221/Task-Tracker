import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { Card, CardBody, CardHeader } from '../../ui/Card';
import { Input } from '../../ui/Input';
import { Modal } from '../../ui/Modal';
import { Pagination } from '../../ui/Pagination';
import { EmptyState, ErrorState, Skeleton } from '../../ui/States';
import { TaskFiltersBar } from '../../tasks/TaskFiltersBar';
import { TaskForm } from '../../tasks/TaskForm';
import { TaskTable } from '../../tasks/TaskTable';
import { KanbanBoard } from '../../tasks/KanbanBoard';
import { SavedViewsBar } from '../../tasks/SavedViewsBar';
import { BulkActionsBar } from '../../tasks/BulkActionsBar';
import { CalendarMonth } from '../../calendar/CalendarMonth';
import { TimelineView } from '../../timeline/TimelineView';
import { useTimeline } from '../../../features/timeline/queries';
import { useMilestones } from '../../../features/projects/queries';
import { useMembers } from '../../../features/projects/queries';
import { useBoard, useCreateTask, useProjectTasks } from '../../../features/tasks/queries';
import { filtersToSearchParams, searchParamsToFilters } from '../../../features/tasks/board';
import { projectRoleCan } from '../../../features/auth/roles';
import type { BoardFilters, TaskFilters } from '../../../features/tasks/types';
import type { Project } from '../../../features/projects/types';
import { useDebounce } from '../../../hooks/useDebounce';
import { cn } from '../../../lib/cn';
import { toast } from '../../../stores/toastStore';

const PAGE_SIZE = 25;

type TaskView = 'list' | 'board' | 'calendar' | 'timeline';

/** Task workspace for one project: board or list, saved views, bulk actions. */
export function TasksTab({ project }: { project: Project }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '');
  const [createOpen, setCreateOpen] = useState(false);
  const [createStatusId, setCreateStatusId] = useState<string | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | undefined>(undefined);
  const [quickTitle, setQuickTitle] = useState('');
  const debouncedSearch = useDebounce(searchInput, 350);
  const syncedQRef = useRef(searchParams.get('q') ?? '');

  const viewParam = searchParams.get('view');
  const view: TaskView = viewParam === 'board' || viewParam === 'calendar' || viewParam === 'timeline' ? viewParam : 'list';
  const canCreate = projectRoleCan(project.myRole, 'task:create');
  const canBulk = projectRoleCan(project.myRole, 'task:update') || projectRoleCan(project.myRole, 'task:delete');
  const canDrag = projectRoleCan(project.myRole, 'task:update_status');

  const filters: TaskFilters = useMemo(
    () => ({
      ...searchParamsToFilters(searchParams),
      q: debouncedSearch || undefined,
      sort: searchParams.get('sort') ?? '-updatedAt',
      page: Number(searchParams.get('page') ?? '1') || 1,
      pageSize: PAGE_SIZE,
    }),
    [searchParams, debouncedSearch],
  );

  const boardFilters: BoardFilters = useMemo(
    () => ({
      q: debouncedSearch || undefined,
      priority: filters.priority,
      assignee: filters.assignee,
      label: filters.label,
      milestone: filters.milestone,
      blocked: filters.blocked,
      includeCancelled: searchParams.get('cancelled') === 'true' || undefined,
      scope: filters.scope === 'mine' ? 'mine' : filters.scope === 'unassigned' ? 'unassigned' : 'all',
    }),
    [debouncedSearch, filters, searchParams],
  );

  const createTask = useCreateTask(project.id);
  const tasks = useProjectTasks(project.id, filters, view === 'list');
  const board = useBoard(project.id, boardFilters, view === 'board');
  const timeline = useTimeline(project.id, view === 'timeline');
  const members = useMembers(project.id);
  const milestones = useMilestones(project.id);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

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
    setActiveViewId(undefined);
    setSelectedIds([]);
    const next = new URLSearchParams(searchParams);
    const setList = (key: string, list?: string[]) => {
      if (list && list.length > 0) next.set(key, list[0]);
      else next.delete(key);
    };
    if ('status' in partial) setList('status', partial.status);
    if ('priority' in partial) setList('priority', partial.priority);
    if ('assignee' in partial) setList('assignee', partial.assignee);
    if ('label' in partial) setList('label', partial.label);
    if ('milestone' in partial) setList('milestone', partial.milestone);
    if ('overdue' in partial) partial.overdue ? next.set('overdue', 'true') : next.delete('overdue');
    if ('blocked' in partial) partial.blocked ? next.set('blocked', 'true') : next.delete('blocked');
    if ('scope' in partial) partial.scope === 'mine' ? next.set('mine', 'true') : next.delete('mine');
    if ('includeCompleted' in partial) partial.includeCompleted ? next.set('completed', 'true') : next.delete('completed');
    if ('sort' in partial && partial.sort) next.set('sort', partial.sort);
    next.delete('page');
    setSearchParams(next, { replace: true });
  };

  const resetFilters = () => {
    setSearchInput('');
    setSelectedIds([]);
    setActiveViewId(undefined);
    setSearchParams({}, { replace: true });
  };

  const applySavedView = (savedFilters: TaskFilters, viewId?: string) => {
    setSearchInput(savedFilters.q ?? '');
    setSelectedIds([]);
    setActiveViewId(viewId);
    const params = filtersToSearchParams(savedFilters);
    const currentView = searchParams.get('view');
    if (currentView) params.set('view', currentView);
    setSearchParams(params, { replace: true });
  };

  const items = tasks.data?.data.tasks ?? [];
  const columns = board.data?.columns ?? [];
  const listTotal = Number(tasks.data?.meta.total ?? items.length);
  const totalPages = Number(tasks.data?.meta.totalPages ?? 1);
  const hasActiveFilters = ['q', 'status', 'priority', 'assignee', 'label', 'milestone', 'overdue', 'mine', 'completed', 'blocked'].some(
    (key) => searchParams.has(key),
  );

  const openCreate = (statusId?: string) => {
    setCreateStatusId(statusId);
    setCreateOpen(true);
  };

  const quickAdd = () => {
    const title = quickTitle.trim();
    if (!title) return;
    createTask.mutate(
      { title },
      {
        onSuccess: (result) => {
          toast.success('Task created', result.task.displayKey);
          setQuickTitle('');
        },
        onError: (error) => toast.error('Could not create task', error.message),
      },
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tasks</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {view === 'board'
              ? `${board.data?.totalTasks ?? 0} task${(board.data?.totalTasks ?? 0) === 1 ? '' : 's'} on the board`
              : `${listTotal} task${listTotal === 1 ? '' : 's'}`}
            {' · keys are prefixed with '}
            {project.code}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Task view"
            className="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700"
          >
            {(['list', 'board', 'calendar', 'timeline'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setParam('view', option === 'list' ? null : option)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                  view === option
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                )}
              >
                {option}
              </button>
            ))}
          </div>
          {canCreate && <Button onClick={() => openCreate()}>New task</Button>}
        </div>
      </div>

      {(view === 'list' || view === 'board') && (
        <>
          <SavedViewsBar
            projectId={project.id}
            currentFilters={filters}
            activeViewId={activeViewId}
            onApply={applySavedView}
          />

          <TaskFiltersBar
            filters={filters}
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            onChange={updateFilters}
            onReset={resetFilters}
            showStatus={view === 'list'}
            showSort={view === 'list'}
            showOverdue={view === 'list'}
            showCompleted={view === 'list'}
            members={members.data?.members ?? []}
            milestones={(milestones.data?.milestones ?? []).map((milestone) => ({ id: milestone.id, name: milestone.name }))}
          />

          {view === 'board' && (
            <label className="flex w-fit items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={searchParams.get('cancelled') === 'true'}
                onChange={(event) => setParam('cancelled', event.target.checked ? 'true' : null)}
                className="h-4 w-4 rounded border-slate-300 accent-indigo-600 dark:border-slate-600"
              />
              Show cancelled
            </label>
          )}
        </>
      )}

      {view === 'list' && canBulk && selectedIds.length > 0 && (
        <BulkActionsBar
          projectId={project.id}
          selectedIds={selectedIds}
          onClear={() => setSelectedIds([])}
        />
      )}

      {view === 'calendar' && (
        <CalendarMonth
          month={calendarMonth}
          onMonthChange={setCalendarMonth}
          filters={{ projectId: project.id }}
          enabled={view === 'calendar'}
          emptyHint="Tasks with dates in this project appear here."
        />
      )}

      {view === 'timeline' && (
        <>
          {timeline.isLoading && <Skeleton className="h-64 w-full" />}
          {timeline.isError && (
            <ErrorState
              title="Could not load the timeline"
              description={timeline.error.message}
              onRetry={() => timeline.refetch()}
            />
          )}
          {timeline.data && <TimelineView data={timeline.data} />}
        </>
      )}

      {view === 'list' ? (
        <Card>
          <CardHeader title="Work items" />
          {canCreate && (
            <CardBody className="border-b border-slate-100 pb-4 dark:border-slate-800">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  quickAdd();
                }}
                className="flex items-end gap-2"
              >
                <div className="flex-1">
                  <Input
                    label=""
                    aria-label="Quick add task"
                    placeholder="Quick add a task and press Enter…"
                    value={quickTitle}
                    onChange={(event) => setQuickTitle(event.target.value)}
                  />
                </div>
                <Button type="submit" disabled={!quickTitle.trim()} loading={createTask.isPending}>
                  Add
                </Button>
              </form>
            </CardBody>
          )}
          {tasks.isLoading && (
            <CardBody className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-3/4" />
            </CardBody>
          )}
          {tasks.isError && (
            <CardBody>
              <ErrorState title="Could not load tasks" description={tasks.error.message} onRetry={() => tasks.refetch()} />
            </CardBody>
          )}
          {!tasks.isLoading && !tasks.isError && items.length === 0 && (
            <CardBody>
              <EmptyState
                title={hasActiveFilters ? 'No tasks match these filters' : 'No tasks yet'}
                description={
                  hasActiveFilters
                    ? canCreate
                      ? 'Adjust the filters or create a new task.'
                      : 'Adjust the filters to see more.'
                    : canCreate
                      ? 'Create the first task for this project.'
                      : 'Tasks created by the team will appear here.'
                }
                action={canCreate ? <Button onClick={() => openCreate()}>New task</Button> : undefined}
              />
            </CardBody>
          )}
          {items.length > 0 && (
            <TaskTable
              tasks={items}
              selectable={canBulk}
              selectedIds={selectedIds}
              onToggleSelect={(taskId) =>
                setSelectedIds((current) =>
                  current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId],
                )
              }
              onToggleSelectAll={(ids) => setSelectedIds(ids)}
            />
          )}
          {items.length > 0 && (
            <CardBody className="border-t border-slate-100 dark:border-slate-800">
              <Pagination page={filters.page ?? 1} totalPages={totalPages} total={listTotal} onPageChange={(page) => setParam('page', String(page))} />
            </CardBody>
          )}
        </Card>
      ) : (
        <>
          {board.isLoading && (
            <div className="flex gap-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-72 w-72 shrink-0" />
              ))}
            </div>
          )}
          {board.isError && (
            <ErrorState title="Could not load the board" description={board.error.message} onRetry={() => board.refetch()} />
          )}
          {!board.isLoading && !board.isError && columns.length > 0 && (
            <>
              <KanbanBoard
                projectId={project.id}
                columns={columns}
                canMove={canDrag}
                onCreateTask={canCreate ? (statusId) => openCreate(statusId) : undefined}
              />
              {board.data?.truncated && (
                <Alert variant="warning">
                  Showing the first {board.data.totalTasks} tasks. Narrow the filters to see the rest.
                </Alert>
              )}
              {!canDrag && (
                <Alert variant="info">
                  Your role does not allow moving tasks; the board is read-only for you.
                </Alert>
              )}
            </>
          )}
        </>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={`New task in ${project.code}`}
        description="Tasks get a project-scoped key such as WEBAPP-1."
        size="lg"
      >
        <TaskForm
          projectId={project.id}
          defaultStatusId={createStatusId}
          onSuccess={() => setCreateOpen(false)}
          onCancel={() => setCreateOpen(false)}
        />
      </Modal>
    </div>
  );
}
