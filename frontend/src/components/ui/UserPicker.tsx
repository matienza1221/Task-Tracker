import { useEffect, useId, useRef, useState } from 'react';
import { useUserLookup } from '../../features/users/queries';
import type { UserLookupResult } from '../../features/users/types';
import { cn } from '../../lib/cn';
import { Avatar } from './Avatar';
import { Spinner } from './Spinner';
import { SearchIcon, XIcon } from './icons';

export interface UserPickerProps {
  label: string;
  value: UserLookupResult | null;
  onChange: (user: UserLookupResult | null) => void;
  error?: string;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  /** Users to hide from the dropdown (e.g. people already on the project). */
  excludeIds?: string[];
  /** How many users to load in the dropdown. */
  limit?: number;
}

/**
 * User picker backed by the minimal directory endpoint. Focusing the field
 * opens a dropdown of selectable users so members can be added with a click;
 * typing filters the list by name or email. Fully keyboard operable.
 */
export function UserPicker({
  label,
  value,
  onChange,
  error,
  placeholder,
  hint,
  disabled,
  excludeIds = [],
  limit = 10,
}: UserPickerProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listId = useId();
  const { data, isFetching } = useUserLookup(search, { enabled: open && !disabled, limit });

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const results: UserLookupResult[] = (data?.users ?? []).filter((user) => !excludeIds.includes(user.id));
  const trimmed = search.trim();

  useEffect(() => {
    setHighlight(0);
  }, [search, data]);

  const select = (user: UserLookupResult) => {
    onChange(user);
    setSearch('');
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      if (open && results[highlight]) {
        event.preventDefault();
        select(results[highlight]);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const activeOptionId = open && results[highlight] ? `${listId}-opt-${highlight}` : undefined;

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>

      {value ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800">
          <Avatar name={value.displayName} src={value.avatarUrl} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-slate-900 dark:text-slate-100">{value.displayName}</span>
            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{value.email}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setSearch('');
              setOpen(true);
            }}
            aria-label={`Clear selected ${label.toLowerCase()}`}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            <XIcon className="text-sm" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute inset-y-0 left-3 my-auto text-base text-slate-400" />
          <input
            id={inputId}
            type="text"
            value={search}
            placeholder={placeholder ?? 'Search by name or email…'}
            disabled={disabled}
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-activedescendant={activeOptionId}
            aria-invalid={error ? true : undefined}
            onKeyDown={onKeyDown}
            onChange={(event) => {
              setSearch(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className={cn(
              'block w-full rounded-lg border bg-white py-2 pr-3 pl-9 text-sm text-slate-900 shadow-sm',
              'focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40',
              'disabled:cursor-not-allowed disabled:bg-slate-100',
              'dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800',
              error ? 'border-red-500' : 'border-slate-300 dark:border-slate-700',
            )}
          />
          {open && (
            <ul
              id={listId}
              role="listbox"
              aria-label={`${label} results`}
              className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
            >
              {isFetching && results.length === 0 && (
                <li className="px-3 py-2">
                  <Spinner className="text-xs" />
                </li>
              )}
              {!isFetching && results.length === 0 && (
                <li className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                  {trimmed ? 'No matching users.' : 'No users available to add.'}
                </li>
              )}
              {results.map((user, index) => (
                <li
                  key={user.id}
                  id={`${listId}-opt-${index}`}
                  role="option"
                  aria-selected={index === highlight}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => select(user)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 px-3 py-2',
                    index === highlight ? 'bg-indigo-50 dark:bg-indigo-950/50' : 'hover:bg-slate-100 dark:hover:bg-slate-800',
                  )}
                >
                  <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-900 dark:text-slate-100">{user.displayName}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {hint && !error && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
