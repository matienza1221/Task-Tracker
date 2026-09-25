import type { Session, User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { env } from '../../config/env';
import { AppError, invalidCredentials, unauthenticated, validationError } from '../../lib/errors';
import { hashPassword, validatePasswordStrength, verifyPassword, getDummyPasswordHash } from '../../lib/password';
import { generateToken, sha256 } from '../../lib/tokens';
import { permissionsForRole, type PermissionKey } from '../../lib/permissions';
import { recordAudit, type AuditContext } from '../audit/service';

const MAX_FAILED_LOGINS = 10;
const LOCK_MINUTES = 15;
const PASSWORD_RESET_TTL_MINUTES = 30;

export interface AuthTokens {
  sessionToken: string;
  csrfToken: string;
}

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  globalRole: User['globalRole'];
  timezone: string;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  permissions: PermissionKey[];
}

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    globalRole: user.globalRole,
    timezone: user.timezone,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    permissions: permissionsForRole(user.globalRole),
  };
}

export async function createSession(userId: string, context: AuditContext): Promise<AuthTokens & { session: Session }> {
  const sessionToken = generateToken();
  const csrfToken = generateToken();
  const now = Date.now();

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(sessionToken),
      csrfTokenHash: sha256(csrfToken),
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null,
      expiresAt: new Date(now + env.SESSION_TTL_HOURS * 3_600_000),
      idleExpiresAt: new Date(now + env.SESSION_IDLE_HOURS * 3_600_000),
      lastSeenAt: new Date(now),
    },
  });

  return { session, sessionToken, csrfToken };
}

export interface LoginResult {
  user: User;
  tokens: AuthTokens;
}

/**
 * Authenticates a user. Failed attempts are counted per account; after
 * MAX_FAILED_LOGINS the account locks for LOCK_MINUTES. Unknown accounts still
 * perform a dummy Argon2 verification so response timing does not reveal
 * whether an email exists.
 */
export async function login(input: {
  email: string;
  password: string;
  context: AuditContext;
}): Promise<LoginResult> {
  const { email, password, context } = input;
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });

  if (!user || !user.isActive) {
    const dummyHash = await getDummyPasswordHash();
    await verifyPassword(dummyHash, password);
    await recordAudit(
      { action: 'LOGIN_FAILED', actorEmail: email, metadata: { reason: user ? 'inactive' : 'unknown_account' } },
      context,
    );
    throw invalidCredentials();
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await recordAudit(
      { action: 'ACCOUNT_LOCKED', actorUserId: user.id, actorEmail: user.email, metadata: { reason: 'locked' } },
      context,
    );
    throw new AppError(
      429,
      'ACCOUNT_LOCKED',
      'This account is temporarily locked after too many failed sign-in attempts. Try again later.',
    );
  }

  const passwordValid = await verifyPassword(user.passwordHash, password);

  if (!passwordValid) {
    const failedLoginCount = user.failedLoginCount + 1;
    const shouldLock = failedLoginCount >= MAX_FAILED_LOGINS;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });

    await recordAudit(
      {
        action: 'LOGIN_FAILED',
        actorUserId: user.id,
        actorEmail: user.email,
        metadata: { failedLoginCount, reason: 'bad_password' },
      },
      context,
    );

    if (shouldLock) {
      await recordAudit(
        { action: 'ACCOUNT_LOCKED', actorUserId: user.id, actorEmail: user.email, metadata: { failedLoginCount } },
        context,
      );
      throw new AppError(
        429,
        'ACCOUNT_LOCKED',
        'This account is temporarily locked after too many failed sign-in attempts. Try again later.',
      );
    }

    throw invalidCredentials();
  }

  const tokens = await createSession(user.id, context);
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  await recordAudit({ action: 'LOGIN', actorUserId: user.id, actorEmail: user.email }, context);

  return { user: updatedUser, tokens };
}

export async function logout(session: Session, actorEmail: string | null, context: AuditContext): Promise<void> {
  if (session.revokedAt) return;
  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  await recordAudit(
    {
      action: 'LOGOUT',
      actorUserId: session.userId,
      actorEmail,
      resourceType: 'session',
      resourceId: session.id,
    },
    context,
  );
}

export async function changePassword(input: {
  user: User;
  currentPassword: string;
  newPassword: string;
  currentSessionId: string;
  context: AuditContext;
}): Promise<User> {
  const { user, currentPassword, newPassword, currentSessionId, context } = input;

  const currentValid = await verifyPassword(user.passwordHash, currentPassword);
  if (!currentValid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
  }

  const problems = validatePasswordStrength(newPassword, { email: user.email, displayName: user.displayName });
  if (problems.length > 0) {
    throw validationError(
      'Password does not meet the requirements.',
      problems.map((message) => ({ path: 'newPassword', message })),
    );
  }

  if (await verifyPassword(user.passwordHash, newPassword)) {
    throw validationError('New password must be different from the current password.', [
      { path: 'newPassword', message: 'New password must be different from the current password.' },
    ]);
  }

  const passwordHash = await hashPassword(newPassword);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });

  // Revoke every other session; keep the current one signed in.
  await prisma.session.updateMany({
    where: { userId: user.id, revokedAt: null, id: { not: currentSessionId } },
    data: { revokedAt: new Date() },
  });

  await recordAudit({ action: 'PASSWORD_CHANGED', actorUserId: user.id, actorEmail: user.email }, context);
  return updated;
}

/**
 * Creates a reset token and writes an outbound message to `mail_outbox`.
 * The caller always returns a generic success response (no account enumeration)
 * and this function does nothing when the account does not exist.
 */
export async function requestPasswordReset(email: string, context: AuditContext): Promise<void> {
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null, isActive: true } });
  if (!user) return;

  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = generateToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
      requestedIp: context.ip ?? null,
    },
  });

  const resetUrl = `${env.APP_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
  await prisma.mailOutbox.create({
    data: {
      toEmail: user.email,
      subject: 'Reset your Project Tracker password',
      body: [
        `Hi ${user.displayName},`,
        '',
        'A password reset was requested for your Project Tracker account.',
        `Open this link to choose a new password (valid for ${PASSWORD_RESET_TTL_MINUTES} minutes):`,
        resetUrl,
        '',
        'If you did not request this, you can ignore this message.',
      ].join('\n'),
    },
  });

  await recordAudit(
    { action: 'PASSWORD_RESET_REQUESTED', actorUserId: user.id, actorEmail: user.email },
    context,
  );
}

export async function resetPassword(input: {
  token: string;
  newPassword: string;
  context: AuditContext;
}): Promise<void> {
  const { token, newPassword, context } = input;
  const reset = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });

  const invalid = () =>
    new AppError(400, 'VALIDATION_ERROR', 'This password reset link is invalid or has expired.');

  if (!reset || reset.usedAt || reset.expiresAt <= new Date()) throw invalid();
  if (!reset.user.isActive || reset.user.deletedAt) throw invalid();

  const problems = validatePasswordStrength(newPassword, {
    email: reset.user.email,
    displayName: reset.user.displayName,
  });
  if (problems.length > 0) {
    throw validationError(
      'Password does not meet the requirements.',
      problems.map((message) => ({ path: 'newPassword', message })),
    );
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null },
    }),
    prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    prisma.session.updateMany({
      where: { userId: reset.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await recordAudit(
    {
      action: 'PASSWORD_RESET_COMPLETED',
      actorUserId: reset.userId,
      actorEmail: reset.user.email,
      resourceType: 'password_reset_token',
      resourceId: reset.id,
    },
    context,
  );
}

/** Self-service registration — only reachable when ENABLE_PUBLIC_REGISTRATION=true. */
export async function registerUser(input: {
  email: string;
  password: string;
  displayName: string;
  context: AuditContext;
}): Promise<LoginResult> {
  const { email, password, displayName, context } = input;

  const problems = validatePasswordStrength(password, { email, displayName });
  if (problems.length > 0) {
    throw validationError(
      'Password does not meet the requirements.',
      problems.map((message) => ({ path: 'password', message })),
    );
  }

  const existing = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (existing) throw new AppError(409, 'CONFLICT', 'An account with this email already exists.');

  const user = await prisma.user.create({
    data: {
      email,
      displayName,
      passwordHash: await hashPassword(password),
      globalRole: 'VIEWER',
      timezone: env.SEED_TIMEZONE,
      isActive: true,
      mustChangePassword: false,
    },
  });

  const tokens = await createSession(user.id, context);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  await recordAudit(
    { action: 'USER_CREATED', actorUserId: user.id, actorEmail: user.email, metadata: { via: 'registration' } },
    context,
  );

  return { user, tokens };
}

export function sessionIsActive(session: Pick<Session, 'revokedAt' | 'expiresAt' | 'idleExpiresAt'>): boolean {
  const now = new Date();
  return !session.revokedAt && session.expiresAt > now && session.idleExpiresAt > now;
}

export function requireUserId(user: User | undefined): string {
  if (!user) throw unauthenticated();
  return user.id;
}
