import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  addMonths,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { cn } from '../../lib/cn';
import { CalendarIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from './icons';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const POPOVER_WIDTH = 280;

export interface DatePickerProps {
  label: string;
  /** ISO date-only value (`yyyy-MM-dd`). */
  value?: string | null;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  id?: string;
  className?: string;
  /** Earliest selectable ISO date (`yyyy-MM-dd`). */
  min?: string;
  max?: string;
  'aria-label'?: string;
}

function parseValue(value?: string | null): Date | null {
  if (!value) return null;
  const date = parseISO(value);
  return isValid(date) ? date : null;
}

/**
 * Date input with a calendar popover for easier picking. The popover is
 * rendered in a portal and positioned against the trigger so it is never
 * clipped by scrollable containers such as modals.
 */
export function DatePicker({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder = 'Pick a date',
  disabled,
  clearable = true,
  id,
  className,
  min,
  max,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseValue(value), [value]);
  const [viewMonth, setViewMonth] = useState<Date>(() => selected ?? new Date());
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const minDate = useMemo(() => parseValue(min), [min]);
  const maxDate = useMemo(() => parseValue(max), [max]);

  useEffect(() => {
    if (open) setViewMonth(selected ?? new Date());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8);
      setPosition({ top: rect.bottom + 6, left: Math.max(8, left) });
    };
    updatePosition();

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const isOutOfRange = (day: Date) => {
    if (minDate && day < startOfDay(minDate)) return true;
    if (maxDate && day > endOfDay(maxDate)) return true;
    return false;
  };

  const describedBy =
    [error ? `${inputId}-error` : null, hint && !error ? `${inputId}-hint` : null].filter(Boolean).join(' ') ||
    undefined;

  const select = (day: Date) => {
    onChange(format(day, 'yyyy-MM-dd'));
    setOpen(false);
  };

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          id={inputId}
          ref={triggerRef}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg border bg-white px-3 py-2 pr-9 text-left text-sm shadow-sm transition-colors',
            'focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40',
            'disabled:cursor-not-allowed disabled:bg-slate-100',
            'dark:bg-slate-900 dark:disabled:bg-slate-800',
            error ? 'border-red-500' : 'border-slate-300 dark:border-slate-700',
          )}
        >
          <CalendarIcon className="shrink-0 text-base text-slate-400" />
          <span
            className={cn(
              'flex-1 truncate',
              selected ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500',
            )}
          >
            {selected ? format(selected, 'MMM d, yyyy') : placeholder}
          </span>
        </button>
        {clearable && selected && !disabled ? (
          <button
            type="button"
            aria-label="Clear date"
            onClick={() => onChange('')}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <XIcon className="text-sm" />
          </button>
        ) : (
          <ChevronDownIcon className="pointer-events-none absolute inset-y-0 right-3 my-auto text-base text-slate-400" />
        )}
      </div>
      {hint && !error && (
        <p id={`${inputId}-hint`} className="text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {open &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Choose date"
            style={{ position: 'fixed', top: position.top, left: position.left, width: POPOVER_WIDTH }}
            className="z-[60] rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setViewMonth((month) => addMonths(month, -1))}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <ChevronLeftIcon className="text-base" />
              </button>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {format(viewMonth, 'MMMM yyyy')}
              </span>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setViewMonth((month) => addMonths(month, 1))}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <ChevronRightIcon className="text-base" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="py-1 text-center text-[10px] font-medium tracking-wide text-slate-400 uppercase dark:text-slate-500"
                >
                  {day}
                </div>
              ))}
              {days.map((day) => {
                const outOfRange = isOutOfRange(day);
                const isSelected = selected ? isSameDay(day, selected) : false;
                return (
                  <button
                    key={format(day, 'yyyy-MM-dd')}
                    type="button"
                    disabled={outOfRange}
                    aria-label={format(day, 'PPP')}
                    aria-selected={isSelected}
                    onClick={() => select(day)}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full text-xs transition-colors',
                      !isSameMonth(day, viewMonth) && 'text-slate-300 dark:text-slate-600',
                      isSelected
                        ? 'bg-indigo-600 font-semibold text-white'
                        : isToday(day)
                          ? 'font-semibold text-indigo-600 hover:bg-slate-100 dark:text-indigo-400 dark:hover:bg-slate-800'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
                      outOfRange && 'cursor-not-allowed text-slate-300 hover:bg-transparent dark:text-slate-700',
                    )}
                  >
                    {format(day, 'd')}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
              <button
                type="button"
                onClick={() => select(new Date())}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
              >
                Today
              </button>
              {clearable && selected && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  Clear
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
