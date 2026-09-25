/**
 * Mirrors the backend's effective project role model (ARCHITECTURE.md §3.1).
 * Used for UX gating only — every request is authorized again server-side.
 */
export type EffectiveProjectRole = 'ADMIN' | 'MANAGER' | 'DEVELOPER' | 'VIEWER';

export const PROJECT_PERMISSIONS: Record<EffectiveProjectRole, string[]> = {
  ADMIN: ['*'],
  MANAGER: [
    'project:view',
    'project:update',
    'project:archive',
    'project:manage_members',
    'project:manage_milestones',
    'project:manage_labels',
    'project:manage_settings',
    'task:view',
    'task:create',
    'task:update',
    'task:update_status',
    'task:delete',
    'comment:create',
    'comment:update_own',
    'comment:moderate',
    'attachment:upload',
    'attachment:download',
    'attachment:delete_own',
    'attachment:moderate',
    'report:view',
    'export:run',
  ],
  DEVELOPER: [
    'project:view',
    'task:view',
    'task:create',
    'task:update',
    'task:update_status',
    'comment:create',
    'comment:update_own',
    'attachment:upload',
    'attachment:download',
    'attachment:delete_own',
    'export:run',
  ],
  VIEWER: ['project:view', 'task:view', 'attachment:download'],
};

export function projectRoleCan(role: EffectiveProjectRole | null | undefined, permission: string): boolean {
  if (!role) return false;
  const granted = PROJECT_PERMISSIONS[role];
  return granted.includes('*') || granted.includes(permission);
}
