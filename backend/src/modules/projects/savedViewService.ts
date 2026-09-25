import type { Prisma, SavedView, User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { assertProjectPermission } from '../../lib/access';
import { notFound } from '../../lib/errors';
import { recordAudit } from '../audit/service';
import { recordActivity } from '../activity/service';
import type { CreateSavedViewInput, UpdateSavedViewInput } from './schemas';

export interface SavedViewDto {
  id: string;
  projectId: string | null;
  name: string;
  scope: string;
  filters: Record<string, unknown>;
  isDefault: boolean;
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
}

function toSavedViewDto(view: SavedView, currentUserId: string): SavedViewDto {
  return {
    id: view.id,
    projectId: view.projectId,
    name: view.name,
    scope: view.scope,
    filters: (view.filters ?? {}) as Record<string, unknown>,
    isDefault: view.isDefault,
    isOwner: view.userId === currentUserId,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
  };
}

/** Saved views are always scoped to the requesting user (or their own global views). */
export async function listSavedViews(user: User, projectId: string): Promise<SavedViewDto[]> {
  const access = await assertProjectPermission(user, projectId, 'project:view');
  const views = await prisma.savedView.findMany({
    where: {
      userId: user.id,
      OR: [{ projectId: access.project.id }, { projectId: null }],
    },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
  return views.map((view) => toSavedViewDto(view, user.id));
}

async function clearOtherDefaults(userId: string, projectId: string, keepId: string): Promise<void> {
  await prisma.savedView.updateMany({
    where: { userId, projectId, isDefault: true, id: { not: keepId } },
    data: { isDefault: false },
  });
}

export async function createSavedView(
  user: User,
  projectId: string,
  input: CreateSavedViewInput,
): Promise<SavedViewDto> {
  const access = await assertProjectPermission(user, projectId, 'project:view');

  const view = await prisma.savedView.create({
    data: {
      userId: user.id,
      projectId: access.project.id,
      scope: 'PROJECT',
      name: input.name,
      filters: input.filters as Prisma.InputJsonValue,
      isDefault: input.isDefault ?? false,
    },
  });

  if (view.isDefault) await clearOtherDefaults(user.id, access.project.id, view.id);

  await recordActivity({
    projectId: access.project.id,
    actor: user,
    action: 'SAVED_VIEW_CREATED',
    metadata: { viewId: view.id, name: view.name },
  });
  await recordAudit({
    action: 'SAVED_VIEW_CREATED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'saved_view',
    resourceId: view.id,
    metadata: { projectId: access.project.id },
  });

  return toSavedViewDto(view, user.id);
}

export async function updateSavedView(
  user: User,
  projectId: string,
  viewId: string,
  input: UpdateSavedViewInput,
): Promise<SavedViewDto> {
  const access = await assertProjectPermission(user, projectId, 'project:view');
  const existing = await prisma.savedView.findFirst({ where: { id: viewId, userId: user.id, projectId: access.project.id } });
  if (!existing) throw notFound('Saved view not found.');

  const view = await prisma.savedView.update({
    where: { id: existing.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.filters !== undefined ? { filters: input.filters as Prisma.InputJsonValue } : {}),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
    },
  });

  if (input.isDefault === true) await clearOtherDefaults(user.id, access.project.id, view.id);

  return toSavedViewDto(view, user.id);
}

export async function deleteSavedView(user: User, projectId: string, viewId: string): Promise<void> {
  const access = await assertProjectPermission(user, projectId, 'project:view');
  const existing = await prisma.savedView.findFirst({ where: { id: viewId, userId: user.id, projectId: access.project.id } });
  if (!existing) throw notFound('Saved view not found.');

  await prisma.savedView.delete({ where: { id: existing.id } });

  await recordActivity({
    projectId: access.project.id,
    actor: user,
    action: 'SAVED_VIEW_DELETED',
    metadata: { viewId: existing.id, name: existing.name },
  });
  await recordAudit({
    action: 'SAVED_VIEW_DELETED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'saved_view',
    resourceId: existing.id,
    metadata: { projectId: access.project.id },
  });
}
