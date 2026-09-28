import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMe, useLogout } from '../../features/auth/queries';
import { formatRole } from '../../lib/format';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../stores/uiStore';
import { toast } from '../../stores/toastStore';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ChevronDownIcon, LogOutIcon, MenuIcon, MoonIcon, SearchIcon, SettingsIcon, SunIcon, UserIcon } from '../ui/icons';
import { COMMAND_PALETTE_EVENT } from './CommandPalette';
import { NotificationBell } from './NotificationBell';

function ThemeToggle() {
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = `Switch to ${next} mode`;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      {theme === 'dark' ? <MoonIcon className="text-lg" /> : <SunIcon className="text-lg" />}
    </button>
  );
}

function UserMenu() {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const user = me.data;
  if (!user) return null;

  const initials = user.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        toast.success('Signed out', 'Your session has been revoked.');
        navigate('/login', { replace: true });
      },
      onError: (error) => {
        toast.error('Could not sign out', error.message);
      },
    });
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg p-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
          {initials || <UserIcon />}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
            {user.displayName}
          </span>
          <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{user.email}</span>
        </span>
        <ChevronDownIcon className="hidden text-base text-slate-400 sm:block" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="User menu"
          className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{user.displayName}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
            <Badge variant="indigo" className="mt-2">
              {formatRole(user.globalRole)}
            </Badge>
          </div>
          <div className="p-1.5">
            <Link
              to="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <SettingsIcon className="text-base" />
              Settings
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              disabled={logout.isPending}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50',
                logout.isPending && 'opacity-60',
              )}
            >
              <LogOutIcon className="text-base" />
              {logout.isPending ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Topbar({ title }: { title?: string }) {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open navigation"
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800"
      >
        <MenuIcon className="text-lg" />
      </button>
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:block dark:hover:bg-slate-800"
      >
        <MenuIcon className="text-lg" />
      </button>

      {title && <h1 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h1>}

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(COMMAND_PALETTE_EVENT))}
          className="hidden items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 sm:flex dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Search (Ctrl+K)"
        >
          <SearchIcon className="text-sm" />
          Search
          <kbd className="rounded border border-slate-300 px-1 font-mono text-[10px] dark:border-slate-600">⌘K</kbd>
        </button>
        <NotificationBell />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}

export { Button as TopbarButton };
