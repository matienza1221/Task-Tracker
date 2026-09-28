import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { SearchIcon } from '../ui/icons';
import { useMe } from '../../features/auth/queries';
import { can } from '../../features/auth/types';
import { useGlobalSearch } from '../../features/search/queries';
import { useDebounce } from '../../hooks/useDebounce';
import { useUiStore } from '../../stores/uiStore';
import { cn } from '../../lib/cn';
import type { AuthUser } from '../../features/auth/types';

export const COMMAND_PALETTE_EVENT = 'teamboard:command-palette';

interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  keywords?: string[];
  run: () => void;
}

interface PaletteItem {
  id: string;
  group: 'Actions' | 'Tasks' | 'Projects';
  label: string;
  hint?: string;
  onSelect: () => void;
  leading?: React.ReactNode;
}

function buildActions(user: AuthUser | undefined, navigate: (path: string) => void, theme: string, setTheme: (t: 'light' | 'dark' | 'system') => void): CommandAction[] {
  const nextTheme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const actions: CommandAction[] = [
    { id: 'go-dashboard', label: 'Go to dashboard', hint: 'Navigation', keywords: ['home', 'overview'], run: () => navigate('/dashboard') },
    { id: 'go-projects', label: 'Go to projects', hint: 'Navigation', keywords: ['list', 'create task'], run: () => navigate('/projects') },
    { id: 'go-my-tasks', label: 'Go to my tasks', hint: 'Navigation', keywords: ['assigned', 'work'], run: () => navigate('/my-tasks') },
    { id: 'go-settings', label: 'Go to settings', hint: 'Navigation', keywords: ['profile', 'password', 'theme'], run: () => navigate('/settings') },
    { id: 'toggle-theme', label: `Switch theme to ${nextTheme}`, hint: 'Appearance', keywords: ['dark', 'light', 'system'], run: () => setTheme(nextTheme) },
  ];
  if (can(user, 'user:manage')) {
    actions.push({ id: 'go-admin-users', label: 'Manage users', hint: 'Administration', keywords: ['accounts', 'roles'], run: () => navigate('/admin/users') });
  }
  if (can(user, 'vocabulary:manage')) {
    actions.push({
      id: 'go-admin-vocabularies',
      label: 'Manage vocabularies',
      hint: 'Administration',
      keywords: ['statuses', 'priorities', 'types'],
      run: () => navigate('/admin/vocabularies'),
    });
  }
  return actions;
}

/**
 * Command palette (Ctrl/Cmd+K): navigates, runs actions and searches tasks and
 * projects the user can access. Fully keyboard operable.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounce(query, 200);
  const search = useGlobalSearch(debounced);
  const me = useMe();
  const navigate = useNavigate();
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener(COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(COMMAND_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
      // Focus after the portal mounts.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const close = () => setOpen(false);

  const actions = useMemo(
    () => buildActions(me.data, navigate, theme, setTheme),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me.data, navigate, theme, setTheme],
  );

  const items: PaletteItem[] = useMemo(() => {
    const term = query.trim().toLowerCase();
    const matchedActions = actions
      .filter(
        (action) =>
          !term ||
          action.label.toLowerCase().includes(term) ||
          (action.keywords ?? []).some((keyword) => keyword.includes(term)),
      )
      .map<PaletteItem>((action) => ({
        id: action.id,
        group: 'Actions',
        label: action.label,
        hint: action.hint,
        onSelect: () => {
          action.run();
          close();
        },
      }));

    const taskItems = (search.data?.tasks ?? []).map<PaletteItem>((task) => ({
      id: `task-${task.id}`,
      group: 'Tasks',
      label: `${task.displayKey} · ${task.title}`,
      hint: task.project.code,
      leading: <Avatar name={task.assignee?.displayName ?? 'Unassigned'} src={task.assignee?.avatarUrl} size="sm" />,
      onSelect: () => {
        navigate(`/tasks/${task.id}`);
        close();
      },
    }));

    const projectItems = (search.data?.projects ?? []).map<PaletteItem>((project) => ({
      id: `project-${project.id}`,
      group: 'Projects',
      label: project.name,
      hint: project.code,
      onSelect: () => {
        navigate(`/projects/${project.id}`);
        close();
      },
    }));

    return [...matchedActions, ...taskItems, ...projectItems];
  }, [actions, navigate, query, search.data]);

  useEffect(() => {
    setHighlight(0);
  }, [debounced]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((value) => Math.min(value + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((value) => Math.max(value - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      items[highlight]?.onSelect();
    } else if (event.key === 'Tab') {
      event.preventDefault();
    }
  };

  if (!open) return null;

  let lastGroup: PaletteItem['group'] | null = null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-20">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={close} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
        className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 dark:border-slate-800">
          <SearchIcon className="text-base text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-results"
            aria-activedescendant={items[highlight]?.id}
            aria-label="Search tasks, projects and actions"
            placeholder="Search tasks, projects or run a command…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-12 w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
          />
          <kbd className="hidden rounded border border-slate-300 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 sm:block dark:border-slate-600 dark:text-slate-400">
            esc
          </kbd>
        </div>

        <ul
          id="command-palette-results"
          role="listbox"
          aria-label="Results"
          className="max-h-80 overflow-y-auto py-2 scrollbar-thin"
        >
          {items.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              {query.trim().length >= 2 ? 'No matches.' : 'Type to search tasks and projects.'}
            </li>
          )}
          {items.map((item, index) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            return (
              <li key={item.id}>
                {showGroup && (
                  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
                    {item.group}
                  </p>
                )}
                <div
                  id={item.id}
                  role="option"
                  aria-selected={index === highlight}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={item.onSelect}
                  className={cn(
                    'mx-2 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm',
                    index === highlight
                      ? 'bg-indigo-50 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-100'
                      : 'text-slate-700 dark:text-slate-200',
                  )}
                >
                  {item.leading}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && (
                    <Badge variant="neutral" className="shrink-0">
                      {item.hint}
                    </Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
          <span>↑↓ navigate · ↵ select</span>
          <span>{search.isFetching ? 'Searching…' : `${items.length} result${items.length === 1 ? '' : 's'}`}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
