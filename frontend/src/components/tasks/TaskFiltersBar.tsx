import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { useVocabularies } from '../../features/meta/queries';
import { TASK_SORT_OPTIONS, type TaskFilters } from '../../features/tasks/types';
import type { ProjectMember } from '../../features/projects/types';

export interface TaskFiltersBarProps {
  filters: TaskFilters;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onChange: (partial: Partial<TaskFilters>) => void;
  onReset: () => void;
  members?: ProjectMember[];
  milestones?: { id: string; name: string }[];
  showAssignee?: boolean;
  showScopeToggle?: boolean;
}

/** URL-synced filter controls shared by the project task list and My Tasks. */
export function TaskFiltersBar({
  filters,
  searchValue,
  onSearchChange,
  onChange,
  onReset,
  members = [],
  milestones = [],
  showAssignee = true,
  showScopeToggle = true,
}: TaskFiltersBarProps) {
  const vocab = useVocabularies();
  const statusKey = filters.status?.[0] ?? '';
  const priorityKey = filters.priority?.[0] ?? '';
  const assigneeId = filters.assignee?.[0] ?? '';
  const milestoneId = filters.milestone?.[0] ?? '';
  const hasFilters = Boolean(
    searchValue ||
      statusKey ||
      priorityKey ||
      assigneeId ||
      milestoneId ||
      filters.overdue ||
      filters.blocked ||
      filters.scope === 'mine' ||
      filters.includeCompleted === true,
  );

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="min-w-[200px] flex-1">
        <Input
          label="Search"
          placeholder="Key, title or description"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
      <div className="w-40">
        <Select
          label="Status"
          placeholder="All statuses"
          options={(vocab.data?.taskStatuses ?? []).map((status) => ({ value: status.key, label: status.name }))}
          value={statusKey}
          onChange={(event) => onChange({ status: event.target.value ? [event.target.value] : undefined })}
        />
      </div>
      <div className="w-40">
        <Select
          label="Priority"
          placeholder="All priorities"
          options={(vocab.data?.taskPriorities ?? []).map((priority) => ({ value: priority.key, label: priority.name }))}
          value={priorityKey}
          onChange={(event) => onChange({ priority: event.target.value ? [event.target.value] : undefined })}
        />
      </div>
      {showAssignee && (
        <div className="w-48">
          <Select
            label="Assignee"
            placeholder="Anyone"
            options={members.map((member) => ({ value: member.userId, label: member.displayName }))}
            value={assigneeId}
            onChange={(event) => onChange({ assignee: event.target.value ? [event.target.value] : undefined })}
          />
        </div>
      )}
      {milestones.length > 0 && (
        <div className="w-44">
          <Select
            label="Milestone"
            placeholder="All milestones"
            options={milestones.map((milestone) => ({ value: milestone.id, label: milestone.name }))}
            value={milestoneId}
            onChange={(event) => onChange({ milestone: event.target.value ? [event.target.value] : undefined })}
          />
        </div>
      )}
      <div className="w-44">
        <Select
          label="Sort"
          options={TASK_SORT_OPTIONS}
          value={filters.sort ?? '-updatedAt'}
          onChange={(event) => onChange({ sort: event.target.value })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4 pb-2.5">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={Boolean(filters.overdue)}
            onChange={(event) => onChange({ overdue: event.target.checked || undefined })}
            className="h-4 w-4 rounded border-slate-300 accent-indigo-600 dark:border-slate-600"
          />
          Overdue only
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={Boolean(filters.blocked)}
            onChange={(event) => onChange({ blocked: event.target.checked || undefined })}
            className="h-4 w-4 rounded border-slate-300 accent-indigo-600 dark:border-slate-600"
          />
          Blocked only
        </label>
        {showScopeToggle && (
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={filters.scope === 'mine'}
              onChange={(event) => onChange({ scope: event.target.checked ? 'mine' : undefined })}
              className="h-4 w-4 rounded border-slate-300 accent-indigo-600 dark:border-slate-600"
            />
            Assigned to me
          </label>
        )}        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={filters.includeCompleted === true}
            onChange={(event) => onChange({ includeCompleted: event.target.checked || undefined })}
            className="h-4 w-4 rounded border-slate-300 accent-indigo-600 dark:border-slate-600"
          />
          Include done
        </label>
      </div>
      {hasFilters && (
        <Button variant="ghost" className="mb-0.5" onClick={onReset}>
          Clear
        </Button>
      )}
    </div>
  );
}
