import type { GlobalRole, Prisma, User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { conflict, forbidden, notFound, validationError } from '../../lib/errors';
import { generateTemporaryPassword, hashPassword, validatePasswordStrength } from '../../lib/password';
import { recordAudit } from '../audit/service';
import type { CreateUserInput, GlobalRoleInput, ListUsersQuery, LookupUsersQuery, UpdateUserInput } from './schemas';

export interface UserSummary {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  globalRole: GlobalRole;
  timezone: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  projectCount: number;
}

type UserWithCount = User & { _count?: { projectMemberships: number } };

export function toUserSummary(user: UserWithCount): UserSummary {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    globalRole: user.globalRole,
    timezone: user.timezone,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    projectCount: user._count?.projectMemberships ?? 0,
  };
}

async function findUserOr404(userId: string): Promise<User> {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) throw notFound('User not found.');
  return user;
}

export async function countActiveAdmins(excludeUserId?: string): Promise<number> {
  return prisma.user.count({
    where: {
      globalRole: 'ADMIN',
      isActive: true,
      deletedAt: null,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
}

/** Guard: never allow the last usable administrator to be removed or demoted. */
async function assertNotLastAdmin(userId: string, action: string): Promise<void> {
  const remaining = await countActiveAdmins(userId);
  if (remaining === 0) {
    throw conflict(`Cannot ${action}: at least one active administrator must remain.`);
  }
}

function assertNotSelf(actor: User, userId: string, action: string): void {
  if (actor.id === userId) {
    throw forbidden(`You cannot ${action} your own account.`);
  }
}

export async function listUsers(query: ListUsersQuery): Promise<{ items: UserSummary[]; total: number }> {
  const where: Prisma.UserWhereInput = { deletedAt: null };
  if (query.role) where.globalRole = query.role;
  if (query.isActive !== undefined) where.isActive = query.isActive;
  if (query.search) {
    where.OR = [
      { displayName: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { _count: { select: { projectMemberships: true } } },
      orderBy: [{ displayName: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { items: rows.map(toUserSummary), total };
}

export async function getUser(userId: string): Promise<UserSummary> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: { _count: { select: { projectMemberships: true } } },
  });
  if (!user) throw notFound('User not found.');
  return toUserSummary(user);
}

/** Minimal, non-sensitive directory used by project member pickers. */
export async function lookupUsers(query: LookupUsersQuery) {
  const where: Prisma.UserWhereInput = { deletedAt: null, isActive: true };
  if (query.search) {
    where.OR = [
      { displayName: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  return prisma.user.findMany({
    where,
    select: { id: true, displayName: true, email: true, globalRole: true, avatarUrl: true },
    orderBy: { displayName: 'asc' },
    take: query.limit,
  });
}

export async function createUser(
  actor: User,
  input: CreateUserInput,
): Promise<{ user: UserSummary; temporaryPassword: string | null }> {
  const existing = await prisma.user.findFirst({ where: { email: input.email, deletedAt: null } });
  if (existing) throw conflict('A user with this email already exists.');

  let temporaryPassword: string | null = null;
  let password = input.password;
  if (!password) {
    temporaryPassword = generateTemporaryPassword();
    password = temporaryPassword;
  } else {
    const problems = validatePasswordStrength(password, { email: input.email, displayName: input.displayName });
    if (problems.length > 0) {
      throw validationError(
        'Password does not meet the requirements.',
        problems.map((message) => ({ path: 'password', message })),
      );
    }
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      displayName: input.displayName,
      globalRole: input.globalRole,
      timezone: input.timezone ?? 'Asia/Manila',
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    },
    include: { _count: { select: { projectMemberships: true } } },
  });

  await recordAudit({
    action: 'USER_CREATED',
    actorUserId: actor.id,
    actorEmail: actor.email,
    resourceType: 'user',
    resourceId: user.id,
    metadata: { globalRole: user.globalRole, temporaryPassword: temporaryPassword !== null },
  });

  return { user: toUserSummary(user), temporaryPassword };
}

export async function updateUser(actor: User, userId: string, input: UpdateUserInput): Promise<UserSummary> {
  const existing = await findUserOr404(userId);

  if (input.isActive === false) {
    assertNotSelf(actor, userId, 'deactivate');
    if (existing.globalRole === 'ADMIN') await assertNotLastAdmin(userId, 'deactivate the last administrator');
  }

  const changedFields = Object.keys(input);
  if (changedFields.length === 0) return toUserSummary(existing);

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: { _count: { select: { projectMemberships: true } } },
  });

  await recordAudit({
    action: input.isActive === false ? 'USER_DEACTIVATED' : input.isActive === true ? 'USER_ACTIVATED' : 'USER_UPDATED',
    actorUserId: actor.id,
    actorEmail: actor.email,
    resourceType: 'user',
    resourceId: user.id,
    metadata: { fields: changedFields },
  });

  return toUserSummary(user);
}

export async function changeUserRole(actor: User, userId: string, globalRole: GlobalRoleInput): Promise<UserSummary> {
  const existing = await findUserOr404(userId);
  assertNotSelf(actor, userId, 'change the role of');

  if (existing.globalRole === 'ADMIN' && globalRole !== 'ADMIN') {
    await assertNotLastAdmin(userId, 'demote the last administrator');
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { globalRole },
    include: { _count: { select: { projectMemberships: true } } },
  });

  await recordAudit({
    action: 'USER_ROLE_CHANGED',
    actorUserId: actor.id,
    actorEmail: actor.email,
    resourceType: 'user',
    resourceId: user.id,
    metadata: { from: existing.globalRole, to: globalRole },
  });

  return toUserSummary(user);
}

export async function deleteUser(actor: User, userId: string, options: { purge: boolean }): Promise<void> {
  const existing = await findUserOr404(userId);
  assertNotSelf(actor, userId, 'delete');
  if (existing.globalRole === 'ADMIN') await assertNotLastAdmin(userId, 'delete the last administrator');

  if (options.purge) {
    await prisma.user.delete({ where: { id: userId } });
    await recordAudit({
      action: 'USER_DELETED',
      actorUserId: actor.id,
      actorEmail: actor.email,
      resourceType: 'user',
      resourceId: userId,
      metadata: { purge: true, email: existing.email },
    });
    return;
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), isActive: false },
    }),
    prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.projectMember.deleteMany({ where: { userId } }),
    prisma.project.updateMany({ where: { managerId: userId }, data: { managerId: null } }),
  ]);

  await recordAudit({
    action: 'USER_DELETED',
    actorUserId: actor.id,
    actorEmail: actor.email,
    resourceType: 'user',
    resourceId: userId,
    metadata: { purge: false, email: existing.email },
  });
}

/**
 * Issues a one-time temporary password. The plaintext value is returned to the
 * administrator once, never stored, and the user must change it on next sign-in.
 */
export async function resetUserPassword(actor: User, userId: string): Promise<{ temporaryPassword: string }> {
  const existing = await findUserOr404(userId);
  if (!existing.isActive) throw conflict('Reactivate the account before resetting its password.');

  const temporaryPassword = generateTemporaryPassword();
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

  await recordAudit({
    action: 'USER_PASSWORD_RESET',
    actorUserId: actor.id,
    actorEmail: actor.email,
    resourceType: 'user',
    resourceId: userId,
    metadata: { targetEmail: existing.email },
  });

  return { temporaryPassword };
}
