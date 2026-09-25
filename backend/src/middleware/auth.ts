import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { asyncHandler, forbidden, unauthenticated } from '../lib/errors';
import { roleHasPermission, type PermissionKey } from '../lib/permissions';
import type { GlobalRole } from '@prisma/client';
import { prisma } from '../db/prisma';
import { env } from '../config/env';
import { sha256 } from '../lib/tokens';
import { logger } from '../lib/logger';
import { SAFE_METHODS, verifyCsrfToken } from './csrf';

const IDLE_REFRESH_MS = 5 * 60 * 1000;

/**
 * Resolves the session cookie to a live session + user. Also enforces CSRF on
 * state-changing methods, so every authenticated mutation is protected without
 * the routes having to remember it.
 */
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const rawToken = (req.cookies as Record<string, string> | undefined)?.[env.SESSION_COOKIE_NAME];
  if (!rawToken) throw unauthenticated();

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(rawToken) },
    include: { user: true },
  });

  const now = new Date();
  if (!session || session.revokedAt || session.expiresAt <= now || session.idleExpiresAt <= now) {
    throw unauthenticated('Your session has expired. Please sign in again.');
  }
  if (!session.user.isActive || session.user.deletedAt) {
    throw unauthenticated('This account is inactive.');
  }

  if (!SAFE_METHODS.has(req.method)) {
    verifyCsrfToken(req, session);
  }

  req.user = session.user;
  req.session = session;

  // Sliding idle expiry, written at most every 5 minutes.
  if (now.getTime() - session.lastSeenAt.getTime() > IDLE_REFRESH_MS) {
    const idleExpiresAt = new Date(now.getTime() + env.SESSION_IDLE_HOURS * 3_600_000);
    prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: now, idleExpiresAt } })
      .catch((error: unknown) => logger.warn({ err: error, sessionId: session.id }, 'Failed to refresh session timestamps'));
  }

  next();
});

/** Coarse role gate for account-level endpoints. */
export function requireRole(...roles: GlobalRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthenticated());
    if (!roles.includes(req.user.globalRole)) return next(forbidden());
    next();
  };
}

/**
 * Account-level permission gate. Project scoping is added in Phase 2 by the
 * access service; this function covers permissions that are global by nature.
 */
export function requirePermission(permission: PermissionKey): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthenticated());
    if (!roleHasPermission(req.user.globalRole, permission)) return next(forbidden());
    next();
  };
}

/** Grants access when the user holds at least one of the listed permissions. */
export function requireAnyPermission(...permissions: PermissionKey[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return next(unauthenticated());
    if (!permissions.some((permission) => roleHasPermission(user.globalRole, permission))) {
      return next(forbidden());
    }
    next();
  };
}
