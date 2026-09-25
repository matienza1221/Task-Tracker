import { useEffect, useRef, useState } from 'react';
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
}

/**
 * Type-ahead user picker backed by the minimal directory endpoint.
 * Requires at least two characters, matching the server-side validation.
 */
export function UserPicker({ label, value, onChange, error, placeholder, hint }: UserPickerProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data, isFetching } = useUserLookup(search);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const results: UserLookupResult[] = data?.users ?? [];

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>

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
            type="text"
            value={search}
            placeholder={placeholder ?? 'Type at least 2 characters…'}
            aria-expanded={open}
            aria-autocomplete="list"
            onChange={(event) => {
              setSearch(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className={cn(
              'block w-full rounded-lg border bg-white py-2 pr-3 pl-9 text-sm text-slate-900 shadow-sm',
              'focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40',
              'dark:bg-slate-900 dark:text-slate-100',
              error ? 'border-red-500' : 'border-slate-300 dark:border-slate-700',
            )}
          />
          {open && search.trim().length >= 2 && (
            <ul
              role="listbox"
              aria-label={`${label} results`}
              className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
            >
              {isFetching && (
                <li className="px-3 py-2">
                  <Spinner className="text-xs" />
                </li>
              )}
              {!isFetching && results.length === 0 && (
                <li className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">No matching active users.</li>
              )}
              {results.map((user) => (
                <li key={user.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(user);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-slate-900 dark:text-slate-100">
                        {user.displayName}
                      </span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</span>
                    </span>
                  </button>
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
