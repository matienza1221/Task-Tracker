import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import type { ComponentType, SVGProps } from 'react';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../stores/uiStore';
import { useMe } from '../../features/auth/queries';
import { useRecentNotifications } from '../../features/notifications/queries';
import { can } from '../../features/auth/types';
import { UploadIcon } from '../ui/upload-icon';
import { BrandMark } from '../ui/brand-mark';
import {
  BarChartIcon,
  BellIcon,
  CalendarIcon,
  CheckSquareIcon,
  FolderIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  ShieldIcon,
  UsersIcon,
  XIcon,
} from '../ui/icons';

interface NavItem {
  label: string;
  to: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  enabled: boolean;
  requiresPermission?: string;
  badge?: number;
}

const PRIMARY_NAV: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboardIcon, enabled: true },
  { label: 'Projects', to: '/projects', icon: FolderIcon, enabled: true },
  { label: 'My Tasks', to: '/my-tasks', icon: CheckSquareIcon, enabled: true },
  { label: 'Team', to: '/team', icon: UsersIcon, enabled: true },
  { label: 'Calendar', to: '/calendar', icon: CalendarIcon, enabled: true },
  { label: 'Reports', to: '/reports', icon: BarChartIcon, enabled: true },
  { label: 'Notifications', to: '/notifications', icon: BellIcon, enabled: true },
];

const ADMIN_NAV: NavItem[] = [
  { label: 'Users', to: '/admin/users', icon: UsersIcon, enabled: true, requiresPermission: 'user:manage' },
  { label: 'Vocabularies', to: '/admin/vocabularies', icon: SettingsIcon, enabled: true, requiresPermission: 'vocabulary:manage' },
  { label: 'Audit log', to: '/admin/audit', icon: ShieldIcon, enabled: true, requiresPermission: 'audit:view' },
  { label: 'Import', to: '/admin/import', icon: UploadIcon, enabled: true, requiresPermission: 'import:run' },
];

const SETTINGS_NAV: NavItem[] = [{ label: 'Settings', to: '/settings', icon: SettingsIcon, enabled: true }];

function NavEntry({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate: () => void }) {
  const Icon = item.icon;

  if (!item.enabled) {
    return (
      <span
        aria-disabled="true"
        title={`${item.label} — coming in a later phase`}
        className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 dark:text-slate-600"
      >
        <Icon className="text-lg" />
        {!collapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-slate-500 uppercase dark:bg-slate-800 dark:text-slate-400">
              Soon
            </span>
          </>
        )}
      </span>
    );
  }

  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
        )
      }
    >
      <Icon className="text-lg" />
      {!collapsed && <span className="flex-1">{item.label}</span>}
      {!collapsed && item.badge !== undefined && item.badge > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const mobileNavOpen = useUiStore((state) => state.mobileNavOpen);
  const setMobileNavOpen = useUiStore((state) => state.setMobileNavOpen);
  const me = useMe();
  const notifications = useRecentNotifications();
  const unreadCount = Number(notifications.data?.meta.unreadCount ?? 0);
  const mobilePanelRef = useRef<HTMLDivElement>(null);

  const closeMobile = () => setMobileNavOpen(false);

  // Mobile drawer behaves like a modal: Escape closes, focus is trapped and
  // the page behind is locked from scrolling.
  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const panel = mobilePanelRef.current;
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavOpen, setMobileNavOpen]);
  const primaryNav = PRIMARY_NAV.map((item) =>
    item.to === '/notifications' ? { ...item, badge: unreadCount } : item,
  );
  const adminItems = ADMIN_NAV.filter(
    (item) => !item.requiresPermission || can(me.data, item.requiresPermission),
  );

  const content = (
    <div className="flex h-full flex-col gap-5 px-3 py-4">
      <div className="flex items-center gap-2.5 px-2">
        <BrandMark className="h-8 w-8" />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">TeamBoard</p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">Development task management</p>
          </div>
        )}
        <button
          type="button"
          onClick={closeMobile}
          className="ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800"
          aria-label="Close navigation"
        >
          <XIcon className="text-base" />
        </button>
      </div>

      <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1 overflow-y-auto scrollbar-thin">
        {primaryNav.map((item) => (
          <NavEntry key={item.to} item={item} collapsed={collapsed} onNavigate={closeMobile} />
        ))}

        {adminItems.length > 0 && (
          <>
            <p
              className={cn(
                'mt-4 px-3 text-[10px] font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500',
                collapsed && 'sr-only',
              )}
            >
              Administration
            </p>
            {adminItems.map((item) => (
              <NavEntry key={item.to} item={item} collapsed={collapsed} onNavigate={closeMobile} />
            ))}
          </>
        )}

        <div className="my-3 border-t border-slate-200 dark:border-slate-800" />
        {SETTINGS_NAV.map((item) => (
          <NavEntry key={item.to} item={item} collapsed={collapsed} onNavigate={closeMobile} />
        ))}
      </nav>
    </div>
  );

  return (
    <>
      <aside
        className={cn(
          'hidden shrink-0 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <div className="sticky top-0 h-screen">{content}</div>
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={closeMobile}
            role="presentation"
            aria-hidden="true"
          />
          <div
            ref={mobilePanelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 w-72 max-w-[85%] border-r border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            {content}
          </div>
        </div>
      )}
    </>
  );
}
