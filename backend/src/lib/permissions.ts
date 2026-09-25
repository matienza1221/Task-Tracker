import type { GlobalRole } from '@prisma/client';

/**
 * Permission catalogue (ARCHITECTURE.md §3.2). The database tables
 * `permissions` / `role_permissions` are seeded from this definition so the
 * admin UI can display them; enforcement uses the same matrix in code so a
 * request never depends on a database round-trip for account-level checks.
 */
export const PERMISSIONS = [
  // Project
  'project:view',
  'project:create',
  'project:update',
  'project:archive',
  'project:delete',
  'project:manage_members',
  'project:manage_milestones',
  'project:manage_labels',
  'project:manage_settings',
  // Task
  'task:view',
  'task:create',
  'task:update',
  'task:update_status',
  'task:assign',
  'task:delete',
  'task:manage_dependencies',
  'task:manage_time',
  // Collaboration
  'comment:create',
  'comment:update_own',
  'comment:moderate',
  'attachment:upload',
  'attachment:download',
  'attachment:delete_own',
  'attachment:moderate',
  // Insight
  'report:view',
  'workload:view',
  // Admin
  'user:manage',
  'role:manage',
  'vocabulary:manage',
  'audit:view',
  'import:run',
  'export:run',
  'settings:manage',
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  'project:view': 'View accessible projects',
  'project:create': 'Create projects',
  'project:update': 'Edit projects',
  'project:archive': 'Archive and unarchive projects',
  'project:delete': 'Permanently delete projects',
  'project:manage_members': 'Add, change and remove project members',
  'project:manage_milestones': 'Manage project milestones',
  'project:manage_labels': 'Manage project labels',
  'project:manage_settings': 'Change project settings',
  'task:view': 'View tasks',
  'task:create': 'Create tasks and subtasks',
  'task:update': 'Edit task fields',
  'task:update_status': 'Change task status',
  'task:assign': 'Assign tasks to other users',
  'task:delete': 'Delete tasks',
  'task:manage_dependencies': 'Manage task dependencies',
  'task:manage_time': 'Log time on tasks',
  'comment:create': 'Add comments',
  'comment:update_own': 'Edit own comments',
  'comment:moderate': 'Edit or delete any comment',
  'attachment:upload': 'Upload attachments',
  'attachment:download': 'Download attachments',
  'attachment:delete_own': 'Delete own attachments',
  'attachment:moderate': 'Delete any attachment',
  'report:view': 'View project reports and analytics',
  'workload:view': 'View team workload',
  'user:manage': 'Create, edit and deactivate users',
  'role:manage': 'Change user roles',
  'vocabulary:manage': 'Manage statuses, priorities and types',
  'audit:view': 'View the audit log',
  'import:run': 'Import spreadsheet data',
  'export:run': 'Export project data',
  'settings:manage': 'Change system settings',
};

const PROJECT_MANAGER_PERMISSIONS: PermissionKey[] = [
  'project:view',
  'project:create',
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
  'task:assign',
  'task:delete',
  'task:manage_dependencies',
  'task:manage_time',
  'comment:create',
  'comment:update_own',
  'comment:moderate',
  'attachment:upload',
  'attachment:download',
  'attachment:delete_own',
  'attachment:moderate',
  'report:view',
  'workload:view',
  'export:run',
];

const DEVELOPER_PERMISSIONS: PermissionKey[] = [
  'project:view',
  'task:view',
  'task:create',
  'task:update',
  'task:update_status',
  'task:manage_dependencies',
  'task:manage_time',
  'comment:create',
  'comment:update_own',
  'attachment:upload',
  'attachment:download',
  'attachment:delete_own',
  'report:view',
  'workload:view',
  'export:run',
];

const VIEWER_PERMISSIONS: PermissionKey[] = [
  'project:view',
  'task:view',
  'attachment:download',
  'report:view',
  'workload:view',
];

/** Admin holds every permission. */
export const ROLE_PERMISSIONS: Record<GlobalRole, readonly PermissionKey[] | 'all'> = {
  ADMIN: 'all',
  PROJECT_MANAGER: PROJECT_MANAGER_PERMISSIONS,
  DEVELOPER: DEVELOPER_PERMISSIONS,
  VIEWER: VIEWER_PERMISSIONS,
};

export function roleHasPermission(role: GlobalRole, permission: PermissionKey): boolean {
  const granted = ROLE_PERMISSIONS[role];
  if (granted === 'all') return true;
  return granted.includes(permission);
}

export function permissionsForRole(role: GlobalRole): PermissionKey[] {
  const granted = ROLE_PERMISSIONS[role];
  return granted === 'all' ? [...PERMISSIONS] : [...granted];
}
