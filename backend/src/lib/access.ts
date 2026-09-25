import type { GlobalRole, Prisma, Project, User } from '@prisma/client';
import { prisma } from '../db/prisma';
import { forbidden, notFound } from './errors';
import { roleHasPermission, type PermissionKey } from './permissions';

/**
 * Effective role a user holds on one project. Global ADMIN is always maximum;
 * otherwise a project membership role applies (a user can be promoted within a
 * project by an admin/manager, which is an intentional grant).
 */
export type EffectiveProjectRole = 'ADMIN' | 'MANAGER' | 'DEVELOPER' | 'VIEWER';

const EFFECTIVE_TO_GLOBAL: Record<EffectiveProjectRole, GlobalRole> = {
  ADMIN: 'ADMIN',
  MANAGER: 'PROJECT_MANAGER',
  DEVELOPER: 'DEVELOPER',
  VIEWER: 'VIEWER',
};

export interface ProjectAccess {
  project: Project;
  role: EffectiveProjectRole;
  isMember: boolean;
  canManageProject: boolean;
}

export function projectRoleHasPermission(role: EffectiveProjectRole, permission: PermissionKey): boolean {
  return roleHasPermission(EFFECTIVE_TO_GLOBAL[role], permission);
}

/**
 * Resolves a user's access to one project without throwing.
 * Returns null when the project does not exist, is deleted, or is invisible
 * to the caller (non-members), which callers turn into a 404.
 */
export async function getProjectAccess(
  user: Pick<User, 'id' | 'globalRole'>,
  projectId: string,
): Promise<ProjectAccess | null> {
  const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
  if (!project) return null;

  if (user.globalRole === 'ADMIN') {
    return { project, role: 'ADMIN', isMember: true, canManageProject: true };
  }

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    select: { projectRole: true },
  });
  if (membership) {
    return {
      project,
      role: membership.projectRole,
      isMember: true,
      canManageProject: membership.projectRole === 'MANAGER',
    };
  }

  // The project manager always retains access, even without a membership row.
  if (project.managerId === user.id) {
    return { project, role: 'MANAGER', isMember: false, canManageProject: true };
  }

  return null;
}

/**
 * Centralized authorization gate for project-scoped resources.
 *  - invisible project/resource  → 404 (no existence leak)
 *  - visible but not permitted   → 403
 */
export async function assertProjectPermission(
  user: User,
  projectId: string,
  permission: PermissionKey,
): Promise<ProjectAccess> {
  const access = await getProjectAccess(user, projectId);
  if (!access) throw notFound('Project not found.');
  if (!projectRoleHasPermission(access.role, permission)) throw forbidden();
  return access;
}

/** WHERE fragment limiting task queries to tasks in projects the user may see. */
export function accessibleTaskWhere(user: User): Prisma.TaskWhereInput {
  return { deletedAt: null, project: { deletedAt: null, AND: [accessibleProjectWhere(user)] } };
}

/** WHERE fragment limiting project queries to what the user may see. */
export function accessibleProjectWhere(user: User): Prisma.ProjectWhereInput {
  if (user.globalRole === 'ADMIN') return {};
  return {
    OR: [{ members: { some: { userId: user.id } } }, { managerId: user.id }],
  };
}

/** True when the user can see the project (used by cross-project operations). */
export async function canViewProject(user: User, projectId: string): Promise<boolean> {
  return (await getProjectAccess(user, projectId)) !== null;
}

export function nativeProjectRole(role: EffectiveProjectRole): 'MANAGER' | 'DEVELOPER' | 'VIEWER' | null {
  return role === 'ADMIN' ? null : role;
}
