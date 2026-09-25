import type { ProjectRole, User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { assertProjectPermission } from '../../lib/access';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { recordAudit } from '../audit/service';
import { recordActivity } from '../activity/service';
import { createNotification } from '../notifications/service';

export interface MemberDto {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  globalRole: string;
  projectRole: ProjectRole;
  isProjectManager: boolean;
  addedBy: { id: string; displayName: string } | null;
  createdAt: string;
}

export async function listMembers(user: User, projectId: string): Promise<MemberDto[]> {
  const access = await assertProjectPermission(user, projectId, 'project:view');

  const members = await prisma.projectMember.findMany({
    where: { projectId: access.project.id },
    include: {
      user: { select: { id: true, displayName: true, email: true, avatarUrl: true, globalRole: true, deletedAt: true } },
      addedBy: { select: { id: true, displayName: true } },
    },
    orderBy: [{ projectRole: 'asc' }, { createdAt: 'asc' }],
  });

  return members
    .filter((member) => member.user.deletedAt === null)
    .map((member) => ({
      userId: member.userId,
      displayName: member.user.displayName,
      email: member.user.email,
      avatarUrl: member.user.avatarUrl,
      globalRole: member.user.globalRole,
      projectRole: member.projectRole,
      isProjectManager: access.project.managerId === member.userId,
      addedBy: member.addedBy,
      createdAt: member.createdAt.toISOString(),
    }));
}

export async function addMember(
  user: User,
  projectId: string,
  input: { userId: string; projectRole: ProjectRole },
): Promise<MemberDto> {
  const access = await assertProjectPermission(user, projectId, 'project:manage_members');

  const target = await prisma.user.findFirst({ where: { id: input.userId, deletedAt: null, isActive: true } });
  if (!target) throw notFound('User not found or inactive.');

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: access.project.id, userId: input.userId } },
  });
  if (existing) throw conflict('This user is already a member of the project.');

  await prisma.projectMember.create({
    data: {
      projectId: access.project.id,
      userId: input.userId,
      projectRole: input.projectRole,
      addedById: user.id,
    },
  });

  await recordActivity({
    projectId: access.project.id,
    actor: user,
    action: 'MEMBER_ADDED',
    metadata: { userId: target.id, displayName: target.displayName, projectRole: input.projectRole },
  });
  await recordAudit({
    action: 'PROJECT_MEMBER_ADDED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'project',
    resourceId: access.project.id,
    metadata: { targetUserId: target.id, projectRole: input.projectRole },
  });
  await createNotification({
    userId: target.id,
    type: 'PROJECT_MEMBER_ADDED',
    title: `You were added to ${access.project.code}`,
    body: `${user.displayName} added you to “${access.project.name}” as ${input.projectRole.toLowerCase()}.`,
    entityType: 'project',
    entityId: access.project.id,
    projectId: access.project.id,
  });

  const members = await listMembers(user, projectId);
  const created = members.find((member) => member.userId === input.userId);
  if (!created) throw notFound('Member not found.');
  return created;
}

export async function updateMemberRole(
  user: User,
  projectId: string,
  memberUserId: string,
  projectRole: ProjectRole,
): Promise<MemberDto> {
  const access = await assertProjectPermission(user, projectId, 'project:manage_members');
  const project = access.project;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId: memberUserId } },
    include: { user: { select: { displayName: true, deletedAt: true } } },
  });
  if (!member || member.user.deletedAt !== null) throw notFound('Member not found.');

  if (memberUserId === user.id) throw forbidden('You cannot change your own project role.');
  if (project.managerId === memberUserId && projectRole !== 'MANAGER' && user.globalRole !== 'ADMIN') {
    throw forbidden('Only an administrator can change the project manager’s role.');
  }

  const updated = await prisma.projectMember.update({
    where: { projectId_userId: { projectId: project.id, userId: memberUserId } },
    data: { projectRole },
  });

  await recordActivity({
    projectId: project.id,
    actor: user,
    action: 'MEMBER_ROLE_CHANGED',
    field: 'projectRole',
    oldValue: member.projectRole,
    newValue: updated.projectRole,
    metadata: { userId: memberUserId, displayName: member.user.displayName },
  });
  await recordAudit({
    action: 'PROJECT_MEMBER_UPDATED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'project',
    resourceId: project.id,
    metadata: { targetUserId: memberUserId, from: member.projectRole, to: projectRole },
  });

  const members = await listMembers(user, projectId);
  const result = members.find((item) => item.userId === memberUserId);
  if (!result) throw notFound('Member not found.');
  return result;
}

export async function removeMember(user: User, projectId: string, memberUserId: string): Promise<void> {
  const access = await assertProjectPermission(user, projectId, 'project:manage_members');
  const project = access.project;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: project.id, userId: memberUserId } },
    include: { user: { select: { displayName: true, deletedAt: true } } },
  });
  if (!member || member.user.deletedAt !== null) throw notFound('Member not found.');

  if (memberUserId === user.id) throw forbidden('You cannot remove yourself from the project.');
  if (project.managerId === memberUserId && user.globalRole !== 'ADMIN') {
    throw forbidden('Only an administrator can remove the project manager.');
  }
  if (project.managerId === memberUserId) {
    throw conflict('Reassign the project manager before removing this member.');
  }

  await prisma.projectMember.delete({ where: { projectId_userId: { projectId: project.id, userId: memberUserId } } });

  await recordActivity({
    projectId: project.id,
    actor: user,
    action: 'MEMBER_REMOVED',
    metadata: { userId: memberUserId, displayName: member.user.displayName },
  });
  await recordAudit({
    action: 'PROJECT_MEMBER_REMOVED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'project',
    resourceId: project.id,
    metadata: { targetUserId: memberUserId },
  });
}
