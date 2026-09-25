import type { NextFunction, Request, RequestHandler } from 'express';
import type { Session } from '@prisma/client';
import { env } from '../config/env';
import { AppError, forbidden } from '../lib/errors';
import { safeEqual, sha256 } from '../lib/tokens';

export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const allowedOrigins = new Set([...env.corsOrigins, env.APP_URL]);

/**
 * Defense-in-depth CSRF layer #1: for state-changing requests that carry an
 * Origin header (all browsers send one for cross-origin requests, and for
 * fetch/XHR same-origin requests), the origin must be allow-listed.
 * Requests without an Origin header are non-browser clients and are not
 * subject to CSRF.
 */
export function originGuard(req: Request, _res: unknown, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  if (allowedOrigins.has(origin)) return next();
  next(forbidden('Request origin is not allowed.'));
}

/**
 * Defense-in-depth CSRF layer #2 (applied by requireAuth for authenticated
 * sessions): double-submit token bound to the session row. The raw token lives
 * in a non-HttpOnly cookie; the X-CSRF-Token header must match the cookie and
 * the token hash stored on the server-side session.
 */
export function verifyCsrfToken(req: Request, session: Session): void {
  const header = req.get('x-csrf-token');
  const cookie = (req.cookies as Record<string, string> | undefined)?.[env.CSRF_COOKIE_NAME];

  if (!header || !cookie || !safeEqual(header, cookie)) {
    throw new AppError(403, 'CSRF_INVALID', 'Invalid or missing CSRF token.');
  }
  if (!safeEqual(sha256(header), session.csrfTokenHash)) {
    throw new AppError(403, 'CSRF_INVALID', 'Invalid or missing CSRF token.');
  }
}

/** Convenience wrapper so the guard can be mounted as plain middleware too. */
export const csrfOriginGuard: RequestHandler = originGuard;
