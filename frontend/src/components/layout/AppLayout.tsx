import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Skeleton } from '../ui/States';
import { ErrorBoundary } from '../ErrorBoundary';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';

function titleForPath(pathname: string): string | undefined {
  if (pathname === '/' || pathname.startsWith('/dashboard')) return 'Dashboard';
  if (pathname.startsWith('/projects/')) return 'Project';
  if (pathname.startsWith('/projects')) return 'Projects';
  if (pathname.startsWith('/tasks/')) return 'Task';
  if (pathname.startsWith('/my-tasks')) return 'My tasks';
  if (pathname.startsWith('/calendar')) return 'Calendar';
  if (pathname.startsWith('/team')) return 'Team';
  if (pathname.startsWith('/reports')) return 'Reports';
  if (pathname.startsWith('/notifications')) return 'Notifications';
  if (pathname.startsWith('/admin/users')) return 'Users';
  if (pathname.startsWith('/admin/audit')) return 'Audit log';
  if (pathname.startsWith('/admin/vocabularies')) return 'Vocabularies';
  if (pathname.startsWith('/admin/import')) return 'Import';
  if (pathname.startsWith('/settings')) return 'Settings';
  return undefined;
}

export function AppLayout() {
  const location = useLocation();
  useDocumentTitle(titleForPath(location.pathname));

  return (
    <div className="min-h-screen lg:flex">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[80] focus:rounded-lg focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <ErrorBoundary>
            <Suspense
              fallback={
                <div className="space-y-4">
                  <Skeleton className="h-8 w-64" />
                  <Skeleton className="h-40 w-full" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
        <CommandPalette />
      </div>
    </div>
  );
}
