import type { ReactNode } from 'react';
import { Avatar } from '../ui/Avatar';
import { ProgressBar } from '../ui/ProgressBar';
import { TaskPriorityBadge, TaskStatusBadge, TaskTypeBadge } from './TaskBadges';
import { LabelChips } from './LabelPicker';
import { BlockedBadge } from './BlockedBadge';
import type { Task } from '../../features/tasks/types';
import { cn } from '../../lib/cn';
import { formatDate } from '../../lib/format';
import { CalendarIcon, CheckSquareIcon } from '../ui/icons';
import { Link } from 'react-router-dom';

/** Card used inside Kanban columns (and as the drag overlay). */
export function BoardCard({
  task,
  overlay = false,
  dragHandle,
  moveControl,
}: {
  task: Task;
  overlay?: boolean;
  /** Drag activator button (keyboard + pointer), rendered by the sortable wrapper. */
  dragHandle?: ReactNode;
  /** Non-drag "move to column" control, so the board is usable without dragging. */
  moveControl?: ReactNode;
}) {
  return (
    <article
      className={cn(
        'rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800',
        overlay && 'rotate-1 shadow-lg',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/tasks/${task.id}`}
          className="font-mono text-[11px] font-semibold text-slate-400 hover:text-indigo-600 dark:text-slate-500"
          draggable={false}
        >
          {task.displayKey}
        </Link>
        <span className="flex items-center gap-1">
          <TaskTypeBadge type={task.type} />
          {dragHandle}
        </span>
      </div>

      <p className="mt-1.5 text-sm leading-snug text-slate-800 dark:text-slate-100">{task.title}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <TaskPriorityBadge priority={task.priority} />
        <BlockedBadge task={task} />
        {task.subtaskCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <CheckSquareIcon className="text-xs" />
            {task.completedSubtaskCount}/{task.subtaskCount}
          </span>
        )}
        <LabelChips labels={task.labels} />
      </div>

      {task.subtaskCount > 0 && <ProgressBar value={task.progress} className="mt-2" label={`${task.displayKey} progress`} />}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        {task.assignee ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Avatar name={task.assignee.displayName} src={task.assignee.avatarUrl} size="sm" />
            <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">{task.assignee.displayName}</span>
          </span>
        ) : (
          <span className="text-[11px] text-slate-400 italic">Unassigned</span>
        )}
        {task.dueDate && (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[11px] whitespace-nowrap',
              task.isOverdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400',
            )}
          >
            <CalendarIcon className="text-xs" />
            {formatDate(task.dueDate)}
          </span>
        )}
      </div>

      {moveControl}

      {!overlay && (
        <span className="sr-only">
          <TaskStatusBadge status={task.status} />
        </span>
      )}
    </article>
  );
}
