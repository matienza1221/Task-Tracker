import type { Response } from 'express';
import { env } from '../config/env';

const baseCookieOptions = {
  secure: env.cookieSecure,
  sameSite: 'lax' as const,
  path: '/',
};

export interface AuthTokens {
  sessionToken: string;
  csrfToken: string;
}

/**
 * Session cookie: HttpOnly (not reachable from JavaScript).
 * CSRF cookie: readable by the SPA, bound to the session token hash server-side.
 */
export function setAuthCookies(res: Response, tokens: AuthTokens): void {
  const maxAge = env.SESSION_TTL_HOURS * 3_600_000;
  res.cookie(env.SESSION_COOKIE_NAME, tokens.sessionToken, {
    ...baseCookieOptions,
    httpOnly: true,
    maxAge,
  });
  res.cookie(env.CSRF_COOKIE_NAME, tokens.csrfToken, {
    ...baseCookieOptions,
    httpOnly: false,
    maxAge,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(env.SESSION_COOKIE_NAME, { ...baseCookieOptions, httpOnly: true });
  res.clearCookie(env.CSRF_COOKIE_NAME, { ...baseCookieOptions, httpOnly: false });
}
