import type { Label, User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { assertProjectPermission } from '../../lib/access';
import { notFound } from '../../lib/errors';
import { recordAudit } from '../audit/service';
import { recordActivity } from '../activity/service';
import type { CreateLabelInput, UpdateLabelInput } from './schemas';

export interface LabelDto {
  id: string;
  projectId: string | null;
  name: string;
  color: string;
  isGlobal: boolean;
  createdAt: string;
}

export function toLabelDto(label: Label): LabelDto {
  return {
    id: label.id,
    projectId: label.projectId,
    name: label.name,
    color: label.color,
    isGlobal: label.projectId === null,
    createdAt: label.createdAt.toISOString(),
  };
}

/** Loads a label that must belong to the project in the URL (IDOR guard). */
async function findProjectLabel(projectId: string, labelId: string): Promise<Label> {
  const label = await prisma.label.findFirst({ where: { id: labelId, projectId, deletedAt: null } });
  if (!label) throw notFound('Label not found.');
  return label;
}

export async function listLabels(user: User, projectId: string): Promise<LabelDto[]> {
  const access = await assertProjectPermission(user, projectId, 'project:view');
  const labels = await prisma.label.findMany({
    where: {
      deletedAt: null,
      OR: [{ projectId: access.project.id }, { projectId: null }],
    },
    orderBy: [{ projectId: 'asc' }, { name: 'asc' }],
  });
  return labels.map(toLabelDto);
}

export async function createLabel(user: User, projectId: string, input: CreateLabelInput): Promise<LabelDto> {
  const access = await assertProjectPermission(user, projectId, 'project:manage_labels');

  const label = await prisma.label.create({
    data: {
      projectId: access.project.id,
      name: input.name,
      color: input.color,
      createdById: user.id,
    },
  });

  await recordActivity({
    projectId: access.project.id,
    actor: user,
    action: 'LABEL_CREATED',
    metadata: { labelId: label.id, name: label.name },
  });
  await recordAudit({
    action: 'LABEL_CREATED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'label',
    resourceId: label.id,
    metadata: { projectId: access.project.id },
  });

  return toLabelDto(label);
}

export async function updateLabel(
  user: User,
  projectId: string,
  labelId: string,
  input: UpdateLabelInput,
): Promise<LabelDto> {
  const access = await assertProjectPermission(user, projectId, 'project:manage_labels');
  const existing = await findProjectLabel(access.project.id, labelId);

  const label = await prisma.label.update({
    where: { id: existing.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    },
  });

  await recordActivity({
    projectId: access.project.id,
    actor: user,
    action: 'LABEL_UPDATED',
    metadata: { labelId: label.id, fields: Object.keys(input) },
  });
  await recordAudit({
    action: 'LABEL_UPDATED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'label',
    resourceId: label.id,
    metadata: { projectId: access.project.id },
  });

  return toLabelDto(label);
}

export async function deleteLabel(user: User, projectId: string, labelId: string): Promise<void> {
  const access = await assertProjectPermission(user, projectId, 'project:manage_labels');
  const existing = await findProjectLabel(access.project.id, labelId);

  await prisma.label.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });

  await recordActivity({
    projectId: access.project.id,
    actor: user,
    action: 'LABEL_DELETED',
    metadata: { labelId: existing.id, name: existing.name },
  });
  await recordAudit({
    action: 'LABEL_DELETED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'label',
    resourceId: existing.id,
    metadata: { projectId: access.project.id },
  });
}
