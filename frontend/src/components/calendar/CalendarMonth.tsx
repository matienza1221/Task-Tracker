import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { EmptyState, ErrorState, Skeleton } from '../ui/States';
import { cn } from '../../lib/cn';
import { PASTEL } from '../../lib/palette';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useCalendar } from '../../features/calendar/queries';
import type { CalendarData, CalendarFilters } from '../../features/calendar/types';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

export interface CalendarMonthProps {
  month: Date;
  onMonthChange: (month: Date) => void;
  filters: Omit<CalendarFilters, 'from' | 'to'>;
  enabled?: boolean;
  /** Rendered above the grid (filters etc.). */
  toolbar?: React.ReactNode;
  emptyHint?: string;
}

interface DayEvent {
  id: string;
  kind: 'task-due' | 'task-start' | 'milestone' | 'project';
  label: string;
  color: string;
  href: string;
  overdue?: boolean;
  done?: boolean;
}

function buildEvents(data: CalendarData): Map<string, DayEvent[]> {
  const events = new Map<string, DayEvent[]>();
  const push = (date: string, event: DayEvent) => {
    const list = events.get(date) ?? [];
    list.push(event);
    events.set(date, list);
  };

  for (const task of data.tasks) {
    const done = task.status.category === 'DONE' || task.status.category === 'CANCELLED';
    if (task.dueDate) {
      push(task.dueDate, {
        id: `due-${task.id}`,
        kind: 'task-due',
        label: `${task.displayKey} ${task.title}`,
        color: task.status.color,
        href: `/tasks/${task.id}`,
        overdue: task.isOverdue,
        done,
      });
    }
    if (task.startDate && task.startDate !== task.dueDate) {
      push(task.startDate, {
        id: `start-${task.id}`,
        kind: 'task-start',
        label: `starts ${task.displayKey}`,
        color: task.status.color,
        href: `/tasks/${task.id}`,
        done,
      });
    }
  }

  for (const milestone of data.milestones) {
    push(milestone.targetDate, {
      id: `milestone-${milestone.id}`,
      kind: 'milestone',
      label: `${milestone.project.code} · ${milestone.name}`,
      color: PASTEL.lilac,
      href: `/projects/${milestone.project.id}?tab=milestones`,
    });
  }

  for (const project of data.projects) {
    push(project.targetDate, {
      id: `project-${project.id}`,
      kind: 'project',
      label: `${project.code} target`,
      color: project.status.color,
      href: `/projects/${project.id}`,
    });
  }

  return events;
}

/**
 * Month grid showing task due/start dates, milestone targets and project
 * targets for the visible window. Dates come from the server (UTC date-only).
 */
export function CalendarMonth({ month, onMonthChange, filters, enabled = true, toolbar, emptyHint }: CalendarMonthProps) {
  const rangeStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const rangeEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });

  const calendar = useCalendar(
    { ...filters, from: format(rangeStart, 'yyyy-MM-dd'), to: format(rangeEnd, 'yyyy-MM-dd') },
    enabled,
  );

  const days = useMemo(() => {
    const list: Date[] = [];
    for (let day = rangeStart; day <= rangeEnd; day = addDays(day, 1)) list.push(day);
    return list;
  }, [rangeStart, rangeEnd]);

  const events = useMemo(() => buildEvents(calendar.data ?? { from: '', to: '', tasks: [], milestones: [], projects: [], truncated: false }), [calendar.data]);

  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const isMobile = useMediaQuery('(max-width: 639px)');

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Days of the visible month that have at least one event (mobile agenda).
  const agendaDays = useMemo(
    () => days.filter((day) => isSameMonth(day, month) && (events.get(format(day, 'yyyy-MM-dd'))?.length ?? 0) > 0),
    [days, events, month],
  );

  const renderEventLink = (event: DayEvent, className: string) => (
    <Link
      to={event.href}
      title={event.label}
      className={cn(
        className,
        event.overdue
          ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
        event.done && 'opacity-60 line-through',
      )}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: event.overdue ? PASTEL.coral : event.color }}
      />
      <span className="truncate">{event.label}</span>
    </Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => onMonthChange(addMonths(month, -1))} aria-label="Previous month">
            ←
          </Button>
          <h2 className="min-w-[160px] text-center text-sm font-semibold text-slate-900 dark:text-slate-100">
            {format(month, 'MMMM yyyy')}
          </h2>
          <Button variant="secondary" size="sm" onClick={() => onMonthChange(addMonths(month, 1))} aria-label="Next month">
            →
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onMonthChange(new Date())}>
            Today
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-indigo-500" /> Task due
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-violet-500" /> Milestone
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Project target
          </span>
        </div>
      </div>

      {toolbar}

      {calendar.isError && (
        <ErrorState title="Could not load the calendar" description={calendar.error.message} onRetry={() => calendar.refetch()} />
      )}

      {calendar.isLoading && (
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      )}

      {!calendar.isLoading && !calendar.isError && !isMobile && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
            {weekDays.map((day) => (
              <div key={day} className="px-2 py-1.5 text-center text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayEvents = events.get(key) ?? [];
              return (
                <div
                  key={key}
                  className={cn(
                    'min-h-[104px] border-r border-b border-slate-100 p-1.5 last:border-r-0 dark:border-slate-800',
                    !isSameMonth(day, month) && 'bg-slate-50/60 dark:bg-slate-800/30',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={cn(
                        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px]',
                        isToday(day)
                          ? 'bg-indigo-600 font-semibold text-white'
                          : 'text-slate-500 dark:text-slate-400',
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                    {dayEvents.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setSelectedDay(day)}
                        aria-label={`Show all ${dayEvents.length} events on ${format(day, 'MMMM d')}`}
                        className="text-[10px] text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        +{dayEvents.length - 2} more
                      </button>
                    )}
                  </div>
                  <ul className="space-y-1">
                    {dayEvents.slice(0, 2).map((event) => (
                      <li key={event.id}>
                        {renderEventLink(event, 'flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight')}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!calendar.isLoading && !calendar.isError && isMobile && agendaDays.length > 0 && (
        <ul className="space-y-3">
          {agendaDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayEvents = events.get(key) ?? [];
            return (
              <li key={key} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                  {isToday(day) ? 'Today · ' : ''}
                  {format(day, 'EEE, MMM d')}
                </p>
                <ul className="space-y-1.5">
                  {dayEvents.map((event) => (
                    <li key={event.id}>
                      {renderEventLink(event, 'flex items-center gap-2 rounded px-2 py-1.5 text-xs leading-tight')}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}

      {!calendar.isLoading && !calendar.isError && (calendar.data?.tasks.length ?? 0) === 0 && (calendar.data?.milestones.length ?? 0) === 0 && (
        <EmptyState
          title="Nothing scheduled this month"
          description={emptyHint ?? 'Tasks with a due or start date, milestones and project targets appear here.'}
        />
      )}

      {calendar.data?.truncated && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Showing the first 500 tasks in this window. Narrow the filters for a complete view.
        </p>
      )}

      <Modal
        open={Boolean(selectedDay)}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? format(selectedDay, 'EEEE, MMMM d') : ''}
        description="All events on this day"
        size="sm"
      >
        <ul className="space-y-1.5">
          {(selectedDay ? events.get(format(selectedDay, 'yyyy-MM-dd')) ?? [] : []).map((event) => (
            <li key={event.id}>
              <Link
                to={event.href}
                onClick={() => setSelectedDay(null)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2 py-2 text-sm',
                  event.overdue
                    ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
                  event.done && 'opacity-60 line-through',
                )}
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: event.overdue ? PASTEL.coral : event.color }}
                />
                <span className="min-w-0 flex-1 truncate">{event.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
