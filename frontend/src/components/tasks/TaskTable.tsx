import { Link } from 'react-router-dom';
import { ProgressBar } from '../ui/ProgressBar';
import { TaskPriorityBadge, TaskStatusBadge, TaskTypeBadge } from './TaskBadges';
import { LabelChips } from './LabelPicker';
import { BlockedBadge } from './BlockedBadge';
import type { Task } from '../../features/tasks/types';
import { cn } from '../../lib/cn';
import { formatDate } from '../../lib/format';
import { CalendarIcon, CheckSquareIcon } from '../ui/icons';

export function TaskProgressCell({ task }: { task: Task }) {
  return (
    <div className="min-w-[110px]">
      <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <span className="tabular-nums">{Math.round(task.progress)}%</span>
        {task.progressMode === 'AUTO' && <span title="Calculated from subtasks">auto</span>}
      </div>
      <ProgressBar value={task.progress} label={`${task.displayKey} progress`} />
    </div>
  );
}

export function TaskTable({
  tasks,
  showProject = false,
  emptyMessage = 'No tasks match these filters.',
  highlightOverdue = true,
  selectable = false,
  selectedIds = [],
  onToggleSelect,
  onToggleSelectAll,
}: {
  tasks: Task[];
  showProject?: boolean;
  emptyMessage?: string;
  highlightOverdue?: boolean;
  selectable?: boolean;
  selectedIds?: string[];
  onToggleSelect?: (taskId: string) => void;
  onToggleSelectAll?: (taskIds: string[]) => void;
}) {
  if (tasks.length === 0) {
    return <p className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
            {selectable && (
              <th scope="col" className="w-10 px-4 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select all tasks on this page"
                  checked={tasks.length > 0 && tasks.every((task) => selectedIds.includes(task.id))}
                  onChange={(event) => onToggleSelectAll?.(event.target.checked ? tasks.map((task) => task.id) : [])}
                  className="h-4 w-4 rounded border-slate-300 accent-indigo-600 dark:border-slate-600"
                />
              </th>
            )}
            <th scope="col" className="px-4 py-2.5 font-medium">Task</th>
            {showProject && <th scope="col" className="px-4 py-2.5 font-medium">Project</th>}
            <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Priority</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Assignee</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Due</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Progress</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {tasks.map((task) => (
            <tr
              key={task.id}
              className={cn(
                'group transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50',
                selectedIds.includes(task.id) && 'bg-indigo-50/60 dark:bg-indigo-950/30',
              )}
            >
              {selectable && (
                <td className="px-4 py-3 align-top">
                  <input
                    type="checkbox"
                    aria-label={`Select ${task.displayKey}`}
                    checked={selectedIds.includes(task.id)}
                    onChange={() => onToggleSelect?.(task.id)}
                    className="h-4 w-4 rounded border-slate-300 accent-indigo-600 dark:border-slate-600"
                  />
                </td>
              )}
              <td className="max-w-[420px] px-4 py-3">
                <Link to={`/tasks/${task.id}`} className="block min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                      {task.displayKey}
                    </span>
                    <TaskTypeBadge type={task.type} />
                    <BlockedBadge task={task} />
                  </div>
                  <p className="mt-0.5 truncate font-medium text-slate-900 group-hover:text-indigo-700 dark:text-slate-100 dark:group-hover:text-indigo-300">
                    {task.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {task.subtaskCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <CheckSquareIcon className="text-xs" />
                        {task.completedSubtaskCount}/{task.subtaskCount} subtasks
                      </span>
                    )}
                    <LabelChips labels={task.labels} />
                  </div>
                </Link>
              </td>
              {showProject && (
                <td className="px-4 py-3">
                  <Link
                    to={`/projects/${task.project.id}`}
                    className="font-mono text-[11px] text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
                  >
                    {task.project.code}
                  </Link>
                </td>
              )}
              <td className="px-4 py-3">
                <TaskStatusBadge status={task.status} />
              </td>
              <td className="px-4 py-3">
                <TaskPriorityBadge priority={task.priority} />
              </td>
              <td className="px-4 py-3">
                {task.assignee ? (
                  <span className="text-xs text-slate-600 dark:text-slate-300">{task.assignee.displayName}</span>
                ) : (
                  <span className="text-xs text-slate-400 italic">Unassigned</span>
                )}
              </td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 text-xs whitespace-nowrap',
                    task.isOverdue && highlightOverdue
                      ? 'font-medium text-red-600 dark:text-red-400'
                      : 'text-slate-500 dark:text-slate-400',
                  )}
                >
                  <CalendarIcon className="text-xs" />
                  {task.dueDate ? formatDate(task.dueDate) : '—'}
                  {task.isOverdue && highlightOverdue && <span className="sr-only">overdue</span>}
                </span>
              </td>
              <td className="px-4 py-3">
                <TaskProgressCell task={task} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
