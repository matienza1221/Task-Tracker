import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { FullPageSpinner } from '../components/ui/Spinner';
import { useMe } from '../features/auth/queries';

/**
 * Client-side guard for routing/UX only. Every server request is authorized
 * independently — the API never trusts the frontend (ARCHITECTURE.md §8).
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();

  if (me.isLoading) return <FullPageSpinner label="Checking your session" />;

  if (!me.data) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  if (me.data.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}
