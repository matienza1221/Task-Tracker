import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../ui/Alert';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Select } from '../ui/Select';
import { Spinner } from '../ui/Spinner';
import { useAddDependency, useDependencies, useRemoveDependency } from '../../features/dependencies/queries';
import { unresolvedBlockers, type DependencyRef } from '../../features/dependencies/types';
import { useProjectTasks } from '../../features/tasks/queries';
import type { Task } from '../../features/tasks/types';
import { cn } from '../../lib/cn';
import { formatDate } from '../../lib/format';
import { toast } from '../../stores/toastStore';

function DependencyRow({
  dependency,
  canManage,
  onRemove,
  removing,
}: {
  dependency: DependencyRef;
  canManage: boolean;
  onRemove: () => void;
  removing: boolean;
}) {
  const resolved = !unresolvedBlockers([dependency]).length;
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <span className="flex h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dependency.status.color }} aria-hidden="true" />
      <Link
        to={`/tasks/${dependency.id}`}
        className={cn(
          'min-w-[160px] flex-1 text-sm',
          resolved
            ? 'text-slate-500 line-through dark:text-slate-400'
            : 'text-slate-800 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400',
        )}
      >
        <span className="mr-2 font-mono text-[11px] text-slate-400">{dependency.key}</span>
        {dependency.title}
      </Link>
      <Badge variant={resolved ? 'success' : 'warning'}>{dependency.status.name}</Badge>
      <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(dependency.dueDate)}</span>
      {canManage && (
        <Button variant="ghost" size="sm" loading={removing} onClick={onRemove}>
          Remove
        </Button>
      )}
    </li>
  );
}

export function DependenciesSection({
  task,
  projectId,
  canManage,
}: {
  task: Task;
  projectId: string;
  canManage: boolean;
}) {
  const dependencies = useDependencies(task.id);
  const addDependency = useAddDependency(task.id);
  const removeDependency = useRemoveDependency(task.id);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [pendingRemove, setPendingRemove] = useState<{
    blockedTaskId: string;
    dependsOnTaskId: string;
    label: string;
  } | null>(null);

  // Candidate tasks come from the project list, excluding this task and any
  // dependency that already exists (the server rejects both anyway).
  const candidates = useProjectTasks(
    projectId,
    { q: search || undefined, pageSize: 20, sort: 'key' },
    canManage && search.trim().length >= 2,
  );

  const blockedBy = dependencies.data?.blockedBy ?? task.blockedBy;
  const blocks = dependencies.data?.blocks ?? task.blocks ?? [];
  const unmet = unresolvedBlockers(blockedBy);

  const options = useMemo(() => {
    const rows = candidates.data?.data.tasks ?? [];
    return rows
      .filter((candidate) => candidate.id !== task.id)
      .filter((candidate) => !blockedBy.some((dependency) => dependency.id === candidate.id))
      .map((candidate) => ({ value: candidate.id, label: `${candidate.displayKey} — ${candidate.title}` }));
  }, [candidates.data, blockedBy, task.id]);

  const onAdd = () => {
    if (!selectedId) return;
    addDependency.mutate(selectedId, {
      onSuccess: () => {
        toast.success('Dependency added');
        setSelectedId('');
        setSearch('');
      },
      onError: (error) => toast.error('Could not add dependency', error.message),
    });
  };

  const onRemove = (blockedTaskId: string, dependsOnTaskId: string) =>
    removeDependency.mutate(
      { blockedTaskId, dependsOnTaskId },
      {
        onSuccess: () => toast.success('Dependency removed'),
        onError: (error) => toast.error('Could not remove dependency', error.message),
      },
    );

  return (
    <Card>
      <CardHeader
        title="Dependencies"
        description={unmet.length > 0 ? `Waiting on ${unmet.length} unfinished task${unmet.length === 1 ? '' : 's'}` : 'No unfinished blockers'}
      />

      {unmet.length > 0 && (
        <CardBody className="pt-0">
          <Alert variant="warning" title="This task is blocked">
            Finish {unmet.map((item) => item.key).join(', ')} before this work can proceed.
          </Alert>
        </CardBody>
      )}

      {dependencies.isLoading && (
        <CardBody>
          <Spinner label="Loading dependencies" />
        </CardBody>
      )}

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {blockedBy.length === 0 && !dependencies.isLoading && (
          <li className="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">No blocking tasks.</li>
        )}
        {blockedBy.map((dependency) => (
          <DependencyRow
            key={`blocked-${dependency.id}`}
            dependency={dependency}
            canManage={canManage}
            removing={removeDependency.isPending}
            onRemove={() =>
              setPendingRemove({ blockedTaskId: task.id, dependsOnTaskId: dependency.id, label: dependency.title })
            }
          />
        ))}
      </ul>

      {blocks.length > 0 && (
        <>
          <CardHeader title="Blocks" description="Tasks waiting on this one" className="border-t" />
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {blocks.map((dependency) => (
              <DependencyRow
                key={`blocks-${dependency.id}`}
                dependency={dependency}
                canManage={canManage}
                removing={removeDependency.isPending}
                onRemove={() =>
                  setPendingRemove({ blockedTaskId: dependency.id, dependsOnTaskId: task.id, label: dependency.title })
                }
              />
            ))}
          </ul>
        </>
      )}

      {canManage && (
        <CardBody className="border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label
                htmlFor="dependency-search"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Add a blocking task
              </label>
              <input
                id="dependency-search"
                type="text"
                value={search}
                placeholder="Search by key or title (2+ characters)…"
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSelectedId('');
                }}
                className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="min-w-[240px] flex-1">
              <Select
                label="Task"
                placeholder={search.trim().length < 2 ? 'Search first' : 'Choose a task'}
                options={options}
                value={selectedId}
                disabled={search.trim().length < 2 || options.length === 0}
                onChange={(event) => setSelectedId(event.target.value)}
              />
            </div>
            <Button className="mb-0" disabled={!selectedId} loading={addDependency.isPending} onClick={onAdd}>
              Add dependency
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Cycles are rejected: a task can never depend on itself, directly or through a chain.
          </p>
        </CardBody>
      )}

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        title="Remove dependency"
        description={
          pendingRemove
            ? `Remove the dependency on "${pendingRemove.label}"? This does not change either task's status.`
            : ''
        }
        confirmLabel="Remove"
        loading={removeDependency.isPending}
        onConfirm={() => {
          if (pendingRemove) onRemove(pendingRemove.blockedTaskId, pendingRemove.dependsOnTaskId);
          setPendingRemove(null);
        }}
        onClose={() => setPendingRemove(null)}
      />
    </Card>
  );
}
