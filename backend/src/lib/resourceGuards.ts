import type { Label, Milestone, SavedView, Task, User } from '@prisma/client';
import { prisma } from '../db/prisma';
import { assertProjectPermission, getProjectAccess, type ProjectAccess } from './access';
import { notFound } from './errors';
import type { PermissionKey } from './permissions';

/**
 * Resource → project → permission resolvers. Every route that receives a
 * resource id in the URL goes through one of these, so an id from another
 * project (or another tenant's data) can never be reached by URL tampering.
 *
 * Direct `prisma.<resource>.findUnique({ where: { id } })` in request paths is
 * forbidden; use these helpers instead (see docs/SECURITY.md).
 */

/**
 * Task → project → permission resolution. The task id from the URL is never
 * trusted; the owning project determines the required membership role.
 */
export async function loadTaskForPermission(
  user: User,
  taskId: string,
  permission: PermissionKey,
): Promise<{ task: Task; access: ProjectAccess }> {
  const task = await prisma.task.findFirst({ where: { id: taskId, deletedAt: null } });
  if (!task) throw notFound('Task not found.');
  const access = await assertProjectPermission(user, task.projectId, permission);
  return { task, access };
}

export async function loadMilestoneForPermission(
  user: User,
  milestoneId: string,
  permission: PermissionKey,
): Promise<{ milestone: Milestone; access: ProjectAccess }> {
  const milestone = await prisma.milestone.findFirst({ where: { id: milestoneId, deletedAt: null } });
  if (!milestone) throw notFound('Milestone not found.');
  const access = await assertProjectPermission(user, milestone.projectId, permission);
  return { milestone, access };
}

export async function loadLabelForPermission(
  user: User,
  labelId: string,
  permission: PermissionKey,
): Promise<{ label: Label; access: ProjectAccess | null }> {
  const label = await prisma.label.findFirst({ where: { id: labelId, deletedAt: null } });
  if (!label) throw notFound('Label not found.');

  // Global labels (project_id = NULL) are managed by administrators only.
  if (label.projectId === null) {
    if (user.globalRole !== 'ADMIN') throw notFound('Label not found.');
    return { label, access: null };
  }

  const access = await assertProjectPermission(user, label.projectId, permission);
  return { label, access };
}

/**
 * Saved views are personal. Only the owner (or an admin) may read or change
 * one; everyone else gets a 404.
 */
export async function loadSavedViewForPermission(
  user: User,
  viewId: string,
): Promise<{ view: SavedView; access: ProjectAccess | null }> {
  const view = await prisma.savedView.findUnique({ where: { id: viewId } });
  if (!view) throw notFound('Saved view not found.');
  if (view.userId !== user.id && user.globalRole !== 'ADMIN') throw notFound('Saved view not found.');

  if (!view.projectId) return { view, access: null };
  const access = await getProjectAccess(user, view.projectId);
  if (!access) throw notFound('Saved view not found.');
  return { view, access };
}
