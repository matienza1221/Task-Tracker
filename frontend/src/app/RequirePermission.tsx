import type { ReactNode } from 'react';
import { useMe } from '../features/auth/queries';
import { can } from '../features/auth/types';
import { ErrorState } from '../components/ui/States';

/**
 * UX gate for pages that require a global permission. The API enforces the
 * same rule independently — this only prevents dead-end navigation.
 */
export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const me = useMe();

  if (me.isLoading) return null;

  if (!can(me.data, permission)) {
    return (
      <ErrorState
        title="You do not have access to this page"
        description="Your role does not include this permission. Contact an administrator if you believe this is a mistake."
      />
    );
  }

  return <>{children}</>;
}
