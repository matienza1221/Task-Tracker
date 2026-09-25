import { useState } from 'react';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Select } from '../ui/Select';
import { useVocabularies } from '../../features/meta/queries';
import { useMembers } from '../../features/projects/queries';
import { useBulkUpdateTasks } from '../../features/tasks/queries';
import { toast } from '../../stores/toastStore';

export interface BulkActionsBarProps {
  projectId: string;
  selectedIds: string[];
  onClear: () => void;
}

/** Bulk operations for managers; every task is authorized server-side. */
export function BulkActionsBar({ projectId, selectedIds, onClear }: BulkActionsBarProps) {
  const vocab = useVocabularies();
  const members = useMembers(projectId);
  const bulk = useBulkUpdateTasks(projectId);

  const [statusId, setStatusId] = useState('');
  const [priorityId, setPriorityId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const statusOptions = (vocab.data?.taskStatuses ?? []).map((item) => ({ value: item.id, label: item.name }));
  const priorityOptions = (vocab.data?.taskPriorities ?? []).map((item) => ({ value: item.id, label: item.name }));
  const memberOptions = [
    { value: '__unassigned__', label: 'Unassigned' },
    ...(members.data?.members ?? []).map((member) => ({ value: member.userId, label: member.displayName })),
  ];

  const run = (
    input: Parameters<typeof bulk.mutate>[0],
    successMessage: (updated: number) => string,
  ) =>
    bulk.mutate(input, {
      onSuccess: (result) => {
        toast.success(successMessage(result.updated));
        onClear();
      },
      onError: (error) => toast.error('Bulk action failed', error.message),
    });

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="flex flex-wrap items-end gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-800 dark:bg-indigo-950/40"
    >
      <p className="pb-2 text-sm font-medium text-indigo-800 dark:text-indigo-200">
        {selectedIds.length} selected
      </p>

      <div className="flex items-end gap-2">
        <div className="w-40">
          <Select
            label="Set status"
            placeholder="Choose…"
            options={statusOptions}
            value={statusId}
            onChange={(event) => setStatusId(event.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          className="mb-0"
          disabled={!statusId || bulk.isPending}
          onClick={() => run({ taskIds: selectedIds, action: 'set-status', statusId }, (n) => `${n} task${n === 1 ? '' : 's'} moved`)}
        >
          Apply
        </Button>
      </div>

      <div className="flex items-end gap-2">
        <div className="w-40">
          <Select
            label="Set priority"
            placeholder="Choose…"
            options={priorityOptions}
            value={priorityId}
            onChange={(event) => setPriorityId(event.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          className="mb-0"
          disabled={!priorityId || bulk.isPending}
          onClick={() => run({ taskIds: selectedIds, action: 'set-priority', priorityId }, (n) => `Priority updated on ${n} task${n === 1 ? '' : 's'}`)}
        >
          Apply
        </Button>
      </div>

      <div className="flex items-end gap-2">
        <div className="w-44">
          <Select
            label="Set assignee"
            placeholder="Choose…"
            options={memberOptions}
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          className="mb-0"
          disabled={!assigneeId || bulk.isPending}
          onClick={() =>
            run(
              {
                taskIds: selectedIds,
                action: 'set-assignee',
                assigneeId: assigneeId === '__unassigned__' ? null : assigneeId,
              },
              (n) => `Assignee updated on ${n} task${n === 1 ? '' : 's'}`,
            )
          }
        >
          Apply
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="danger" disabled={bulk.isPending} onClick={() => setConfirmDelete(true)}>
          Delete selected
        </Button>
        <Button variant="ghost" onClick={onClear} disabled={bulk.isPending}>
          Clear selection
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete selected tasks"
        description={`Delete ${selectedIds.length} task${selectedIds.length === 1 ? '' : 's'}? Their subtasks are deleted as well.`}
        confirmLabel="Delete tasks"
        loading={bulk.isPending}
        onConfirm={() => {
          setConfirmDelete(false);
          run({ taskIds: selectedIds, action: 'delete' }, (n) => `${n} task${n === 1 ? '' : 's'} deleted`);
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
