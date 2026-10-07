import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/States';
import { BlockedBadge } from '../tasks/BlockedBadge';
import type { TimelineData } from '../../features/timeline/queries';
import type { Task } from '../../features/tasks/types';
import { cn } from '../../lib/cn';
import { readableTextColor } from '../../lib/color';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { formatDate } from '../../lib/format';
import { addDays, differenceInCalendarDays, eachMonthOfInterval, endOfMonth, format, parseISO, startOfMonth } from 'date-fns';

const LEFT_COLUMN = 'w-64 shrink-0';

function toDate(value: string): Date {
  return parseISO(value);
}

function taskStart(task: Task): Date | null {
  if (task.startDate) return toDate(task.startDate);
  if (task.dueDate) return addDays(toDate(task.dueDate), -1);
  return null;
}

function taskEnd(task: Task): Date | null {
  if (task.dueDate) return toDate(task.dueDate);
  if (task.startDate) return addDays(toDate(task.startDate), 1);
  return null;
}

/**
 * Gantt-style timeline for one project: a month ruler, milestone markers and
 * one bar per scheduled task. Tasks without any date are listed as
 * "unscheduled" so nothing silently disappears.
 */
export function TimelineView({ data }: { data: TimelineData }) {
  const { rangeStart, rangeEnd, span } = useMemo(() => {
    const dates: Date[] = [];
    if (data.project.startDate) dates.push(toDate(data.project.startDate));
    if (data.project.targetDate) dates.push(toDate(data.project.targetDate));
    for (const task of data.tasks) {
      if (task.startDate) dates.push(toDate(task.startDate));
      if (task.dueDate) dates.push(toDate(task.dueDate));
    }
    for (const milestone of data.milestones) {
      if (milestone.targetDate) dates.push(toDate(milestone.targetDate));
    }

    const start = dates.length > 0 ? new Date(Math.min(...dates.map((date) => date.getTime()))) : startOfMonth(new Date());
    const end = dates.length > 0 ? new Date(Math.max(...dates.map((date) => date.getTime()))) : endOfMonth(new Date());
    const paddedStart = addDays(start, -2);
    const paddedEnd = addDays(end, 2);
    const days = Math.max(differenceInCalendarDays(paddedEnd, paddedStart) + 1, 14);
    return { rangeStart: paddedStart, rangeEnd: paddedEnd, span: days };
  }, [data]);

  const daysBetween = (a: Date, b: Date): number => differenceInCalendarDays(a, b);
  const pct = (date: Date): number => (daysBetween(date, rangeStart) / span) * 100;

  const months = useMemo(() => eachMonthOfInterval({ start: rangeStart, end: rangeEnd }), [rangeStart, rangeEnd]);

  const scheduled = useMemo(
    () =>
      data.tasks
        .filter((task) => taskStart(task) && taskEnd(task))
        .sort((a, b) => (taskStart(a)!.getTime() - taskStart(b)!.getTime()) || a.number - b.number),
    [data.tasks],
  );
  const unscheduled = data.tasks.filter((task) => !taskStart(task) || !taskEnd(task));

  const today = new Date();
  const todayPct = pct(today);
  const showToday = todayPct >= 0 && todayPct <= 100;
  const isMobile = useMediaQuery('(max-width: 639px)');

  if (data.tasks.length === 0) {
    return <EmptyState title="Nothing to plot yet" description="Create tasks with start or due dates to see the timeline." />;
  }

  return (
    <div className="space-y-4">
      {isMobile ? (
        <ul className="space-y-2">
        {scheduled.map((task) => (
          <li key={task.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <Link
              to={`/tasks/${task.id}`}
              className="block truncate text-sm text-slate-800 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400"
            >
              <span className="mr-1.5 font-mono text-[11px] text-slate-400">{task.displayKey}</span>
              {task.title}
            </Link>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {formatDate(task.startDate)} → {formatDate(task.dueDate)}
              {task.assignee ? ` · ${task.assignee.displayName}` : ''}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.max(0, Math.min(100, task.progress))}%`, backgroundColor: task.status.color }}
                />
              </span>
              <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{task.progress}%</span>
              <BlockedBadge task={task} />
            </div>
          </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="min-w-[760px]">
          <div className="flex border-b border-slate-200 dark:border-slate-800">
            <div className={cn(LEFT_COLUMN, 'px-3 py-2 text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400')}>
              Task
            </div>
            <div className="flex flex-1">
              {months.map((month) => {
                const monthStart = month < rangeStart ? rangeStart : startOfMonth(month);
                const monthEnd = endOfMonth(month) > rangeEnd ? rangeEnd : endOfMonth(month);
                const width = ((daysBetween(monthEnd, monthStart) + 1) / span) * 100;
                return (
                  <div
                    key={month.toISOString()}
                    style={{ width: `${width}%` }}
                    className="border-l border-slate-100 px-2 py-2 text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400"
                  >
                    {format(month, 'MMM yyyy')}
                  </div>
                );
              })}
            </div>
          </div>

          {data.milestones.some((milestone) => milestone.targetDate) && (
            <div className="flex border-b border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/30">
              <div className={cn(LEFT_COLUMN, 'px-3 py-2 text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400')}>
                Milestones
              </div>
              <div className="relative h-9 flex-1">
                {data.milestones
                  .filter((milestone) => milestone.targetDate)
                  .map((milestone) => (
                    <Link
                      key={milestone.id}
                      to={`/projects/${data.project.id}?tab=milestones`}
                      style={{ left: `${pct(toDate(milestone.targetDate as string))}%` }}
                      className="absolute top-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 hover:bg-violet-200 dark:bg-violet-950/60 dark:text-violet-300"
                      title={`${milestone.name} · ${formatDate(milestone.targetDate)}`}
                    >
                      ◆ {milestone.name}
                    </Link>
                  ))}
              </div>
            </div>
          )}

          {scheduled.map((task) => {
            const start = taskStart(task)!;
            const end = taskEnd(task)!;
            const left = Math.max(0, pct(start));
            const width = Math.max(((daysBetween(end, start) + 1) / span) * 100, 1.5);
            const done = task.status.category === 'DONE';
            const cancelled = task.status.category === 'CANCELLED';
            return (
              <div
                key={task.id}
                className="flex items-center border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/40"
              >
                <div className={cn(LEFT_COLUMN, 'px-3 py-2')}>
                  <Link to={`/tasks/${task.id}`} className="block truncate text-sm text-slate-800 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400">
                    <span className="mr-1.5 font-mono text-[11px] text-slate-400">{task.displayKey}</span>
                    {task.title}
                  </Link>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    {task.assignee ? (
                      <>
                        <Avatar name={task.assignee.displayName} src={task.assignee.avatarUrl} size="sm" />
                        <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">{task.assignee.displayName}</span>
                      </>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">Unassigned</span>
                    )}
                    <BlockedBadge task={task} />
                  </span>
                </div>
                <div className="relative h-12 flex-1">
                  {showToday && (
                    <span
                      aria-hidden="true"
                      style={{ left: `${todayPct}%` }}
                      className="absolute inset-y-0 border-l border-dashed border-red-300 dark:border-red-900"
                    />
                  )}
                  <Link
                    to={`/tasks/${task.id}`}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: cancelled ? '#94a3b8' : task.status.color,
                      color: readableTextColor(cancelled ? '#94a3b8' : task.status.color),
                    }}
                    className={cn(
                      'absolute top-3 flex h-6 items-center overflow-hidden rounded px-1.5 text-[10px] font-medium shadow-sm',
                      (done || cancelled) && 'opacity-70',
                    )}
                    title={`${task.title}\n${formatDate(task.startDate)} → ${formatDate(task.dueDate)}\nStatus: ${task.status.name}`}
                  >
                    <span className="truncate">{task.progress}%</span>
                  </Link>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {unscheduled.length > 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
          <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
            Unscheduled ({unscheduled.length})
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {unscheduled.map((task) => (
              <li key={task.id}>
                <Link
                  to={`/tasks/${task.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <span className="font-mono text-[10px] text-slate-400">{task.displayKey}</span>
                  {task.title}
                  <BlockedBadge task={task} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
        <Badge variant="neutral">Bars show task progress</Badge>
        <span>◆ milestone target</span>
        <span>dashed red line = today</span>
        <span>Window: {formatDate(rangeStart.toISOString().slice(0, 10))} → {formatDate(rangeEnd.toISOString().slice(0, 10))}</span>
      </div>
    </div>
  );
}
