import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from '../config/env';
import { sendError } from '../lib/response';
import { anonymizedKey } from '../lib/tokens';

const tooManyRequests = (message: string) => (_req: Request, res: Response) =>
  sendError(res, 429, 'RATE_LIMITED', message);

const baseOptions = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
};

/** Broad protection for the whole API surface. */
export const globalLimiter = rateLimit({
  ...baseOptions,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: () => env.RATE_LIMIT_MAX,
  skip: (req) => req.method === 'OPTIONS' || req.path === '/api/health',
  handler: tooManyRequests('Too many requests. Please slow down and try again shortly.'),
});

/**
 * Login limiter: counts only failed attempts (`skipSuccessfulRequests`), keyed
 * by client IP *and* a non-reversible hash of the submitted email.
 */
export const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: () => env.AUTH_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip ?? 'unknown')}:${anonymizedKey(String((req.body as Record<string, unknown> | undefined)?.email ?? ''))}`,
  handler: tooManyRequests('Too many failed sign-in attempts. Please wait a few minutes and try again.'),
});

/** Password reset request limiter (per IP). */
export const passwordResetLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: () => env.PASSWORD_RESET_RATE_LIMIT_MAX,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
  handler: tooManyRequests('Too many password reset requests. Please try again later.'),
});

/** Registration limiter (per IP), used only when public registration is enabled. */
export const registerLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: () => env.AUTH_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
  handler: tooManyRequests('Too many registration attempts. Please try again later.'),
});
