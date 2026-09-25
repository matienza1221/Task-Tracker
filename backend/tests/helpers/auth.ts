import request from 'supertest';
import type { Express } from 'express';
import { env } from '../../src/config/env';

export interface SessionClient {
  cookieHeader: string;
  csrfToken: string;
}

function extractCookies(response: request.Response): string[] {
  const header = response.headers['set-cookie'];
  if (!header) return [];
  return Array.isArray(header) ? header : [header];
}

function cookieValue(setCookies: string[], name: string): string | undefined {
  for (const cookie of setCookies) {
    if (cookie.startsWith(`${name}=`)) {
      const raw = cookie.split(';')[0].slice(name.length + 1);
      return decodeURIComponent(raw);
    }
  }
  return undefined;
}

/** Performs a real login and captures the session + CSRF cookies. */
export async function loginAs(app: Express, email: string, password: string): Promise<SessionClient> {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  if (response.status !== 200) {
    throw new Error(`Login failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`);
  }
  const cookies = extractCookies(response);
  const sessionToken = cookieValue(cookies, env.SESSION_COOKIE_NAME);
  const csrfToken = cookieValue(cookies, env.CSRF_COOKIE_NAME);
  if (!sessionToken || !csrfToken) {
    throw new Error('Login response did not set the expected session cookies.');
  }
  return {
    cookieHeader: `${env.SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}; ${env.CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}`,
    csrfToken,
  };
}

/** supertest request helpers that attach session cookies and the CSRF header. */
export function authed(app: Express, client: SessionClient) {
  const decorate = (test: request.Test): request.Test =>
    test.set('Cookie', client.cookieHeader).set('X-CSRF-Token', client.csrfToken);

  return {
    get: (url: string) => decorate(request(app).get(url)),
    post: (url: string) => decorate(request(app).post(url)),
    patch: (url: string) => decorate(request(app).patch(url)),
    put: (url: string) => decorate(request(app).put(url)),
    delete: (url: string) => decorate(request(app).delete(url)),
  };
}
