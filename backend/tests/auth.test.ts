import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { env } from '../src/config/env';
import { sha256 } from '../src/lib/tokens';
import { authed, loginAs } from './helpers/auth';
import { createTestUser, TEST_PASSWORD } from './helpers/db';

const NEW_PASSWORD = 'Brand_New_Password_456!';

describe('POST /api/auth/login', () => {
  it('signs in with valid credentials, issues HttpOnly session cookie and readable CSRF cookie', async () => {
    const user = await createTestUser({ email: 'dev@example.com' });

    const response = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.email).toBe('dev@example.com');
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.body.data.user.permissions).toContain('task:update_status');

    const cookies = response.headers['set-cookie'] as unknown as string[];
    const sessionCookie = cookies.find((cookie) => cookie.startsWith(`${env.SESSION_COOKIE_NAME}=`));
    const csrfCookie = cookies.find((cookie) => cookie.startsWith(`${env.CSRF_COOKIE_NAME}=`));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('SameSite=Lax');
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie).not.toContain('HttpOnly');
  });

  it('stores only the SHA-256 hash of the session token', async () => {
    const user = await createTestUser({ email: 'hash@example.com' });
    const response = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const sessionCookie = cookies.find((cookie) => cookie.startsWith(`${env.SESSION_COOKIE_NAME}=`))!;
    const rawToken = decodeURIComponent(sessionCookie.split(';')[0].slice(env.SESSION_COOKIE_NAME.length + 1));

    const stored = await prisma.session.findUnique({ where: { tokenHash: sha256(rawToken) } });
    expect(stored).not.toBeNull();
    const plaintext = await prisma.session.findFirst({ where: { tokenHash: rawToken } });
    expect(plaintext).toBeNull();
    expect(stored!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a wrong password and records a failed login', async () => {
    const user = await createTestUser({ email: 'wrong@example.com' });

    const response = await request(app).post('/api/auth/login').send({ email: user.email, password: 'Wrong_Password_1!' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.failedLoginCount).toBe(1);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'LOGIN_FAILED', actorUserId: user.id } });
    expect(audit).not.toBeNull();
    expect(audit!.metadata).toMatchObject({ reason: 'bad_password' });
  });

  it('does not reveal whether an email exists', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'Some_Password_123!' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');

    const audit = await prisma.auditLog.findFirst({ where: { action: 'LOGIN_FAILED' } });
    expect(audit).not.toBeNull();
    expect(audit!.actorUserId).toBeNull();
    expect(audit!.metadata).toMatchObject({ reason: 'unknown_account' });
  });

  it('locks the account after 10 failed attempts and blocks further sign-in', async () => {
    const user = await createTestUser({ email: 'lock@example.com' });

    for (let attempt = 1; attempt <= 9; attempt += 1) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'Wrong_Password_1!' });
      expect(response.status).toBe(401);
    }

    const tenth = await request(app).post('/api/auth/login').send({ email: user.email, password: 'Wrong_Password_1!' });
    expect(tenth.status).toBe(429);
    expect(tenth.body.error.code).toBe('ACCOUNT_LOCKED');

    const locked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(locked.lockedUntil).not.toBeNull();
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    const correctWhileLocked = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(correctWhileLocked.status).toBe(429);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'ACCOUNT_LOCKED', actorUserId: user.id } });
    expect(audit).not.toBeNull();
  });

  it('resets the failure counter after a successful sign-in', async () => {
    const user = await createTestUser({ email: 'reset-counter@example.com' });
    await request(app).post('/api/auth/login').send({ email: user.email, password: 'Wrong_Password_1!' });
    await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.failedLoginCount).toBe(0);
    expect(refreshed.lastLoginAt).not.toBeNull();
  });

  it('validates input and strips unknown fields', async () => {
    const invalidEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: TEST_PASSWORD });
    expect(invalidEmail.status).toBe(422);
    expect(invalidEmail.body.error.code).toBe('VALIDATION_ERROR');
    expect(invalidEmail.body.error.details[0].path).toBe('email');

    const extraField = await request(app)
      .post('/api/auth/login')
      .send({ email: 'dev@example.com', password: TEST_PASSWORD, globalRole: 'ADMIN' });
    expect(extraField.status).toBe(422);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without a session', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a forged session token', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${env.SESSION_COOKIE_NAME}=forged-token`);
    expect(response.status).toBe(401);
  });

  it('returns the authenticated user', async () => {
    await createTestUser({ email: 'me@example.com', globalRole: 'PROJECT_MANAGER' });
    const client = await loginAs(app, 'me@example.com', TEST_PASSWORD);

    const response = await authed(app, client).get('/api/auth/me');
    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe('me@example.com');
    expect(response.body.data.user.globalRole).toBe('PROJECT_MANAGER');
  });

  it('rejects sessions whose expiry has passed', async () => {
    const user = await createTestUser({ email: 'expired@example.com' });
    const client = await loginAs(app, user.email, TEST_PASSWORD);
    await prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const response = await authed(app, client).get('/api/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects sessions whose idle window has passed', async () => {
    const user = await createTestUser({ email: 'idle@example.com' });
    const client = await loginAs(app, user.email, TEST_PASSWORD);
    await prisma.session.updateMany({ where: { userId: user.id }, data: { idleExpiresAt: new Date(Date.now() - 1000) } });

    const response = await authed(app, client).get('/api/auth/me');
    expect(response.status).toBe(401);
  });

  it('rejects deactivated accounts', async () => {
    const user = await createTestUser({ email: 'inactive@example.com' });
    const client = await loginAs(app, user.email, TEST_PASSWORD);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    const response = await authed(app, client).get('/api/auth/me');
    expect(response.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session and clears cookies', async () => {
    const user = await createTestUser({ email: 'logout@example.com' });
    const client = await loginAs(app, user.email, TEST_PASSWORD);

    const response = await authed(app, client).post('/api/auth/logout');
    expect(response.status).toBe(200);

    const session = await prisma.session.findFirst({ where: { userId: user.id } });
    expect(session!.revokedAt).not.toBeNull();

    const after = await authed(app, client).get('/api/auth/me');
    expect(after.status).toBe(401);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'LOGOUT', actorUserId: user.id } });
    expect(audit).not.toBeNull();
    expect(audit!.actorEmail).toBe(user.email);
    expect(audit!.resourceType).toBe('session');
  });
});

describe('CSRF protection', () => {
  it('rejects an authenticated mutation without the CSRF header', async () => {
    const user = await createTestUser({ email: 'csrf1@example.com' });
    const client = await loginAs(app, user.email, TEST_PASSWORD);

    const response = await request(app).post('/api/auth/logout').set('Cookie', client.cookieHeader);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });

  it('rejects a CSRF header that does not match the session', async () => {
    const user = await createTestUser({ email: 'csrf2@example.com' });
    const client = await loginAs(app, user.email, TEST_PASSWORD);

    const response = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', client.cookieHeader)
      .set('X-CSRF-Token', 'forged-token');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });

  it('allows the mutation when the CSRF token matches', async () => {
    const user = await createTestUser({ email: 'csrf3@example.com' });
    const client = await loginAs(app, user.email, TEST_PASSWORD);

    const response = await authed(app, client).post('/api/auth/logout');
    expect(response.status).toBe(200);
  });

  it('blocks state-changing requests from unknown origins', async () => {
    const response = await request(app)
      .post('/api/auth/password/forgot')
      .set('Origin', 'https://evil.example.com')
      .send({ email: 'dev@example.com' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('allows state-changing requests from an allow-listed origin', async () => {
    const response = await request(app)
      .post('/api/auth/password/forgot')
      .set('Origin', 'https://app.example.com')
      .send({ email: 'dev@example.com' });
    expect(response.status).toBe(200);
  });
});

describe('POST /api/auth/password/change', () => {
  it('requires the current password', async () => {
    const user = await createTestUser({ email: 'change1@example.com' });
    const client = await loginAs(app, user.email, TEST_PASSWORD);

    const response = await authed(app, client)
      .post('/api/auth/password/change')
      .send({ currentPassword: 'Wrong_Password_1!', newPassword: NEW_PASSWORD });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects weak passwords with actionable details', async () => {
    const user = await createTestUser({ email: 'change2@example.com' });
    const client = await loginAs(app, user.email, TEST_PASSWORD);

    const response = await authed(app, client)
      .post('/api/auth/password/change')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'short' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('changes the password, revokes other sessions and keeps the current one', async () => {
    const user = await createTestUser({ email: 'change3@example.com' });
    const first = await loginAs(app, user.email, TEST_PASSWORD);
    const second = await loginAs(app, user.email, TEST_PASSWORD);

    const response = await authed(app, first)
      .post('/api/auth/password/change')
      .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD });
    expect(response.status).toBe(200);

    const otherSession = await authed(app, second).get('/api/auth/me');
    expect(otherSession.status).toBe(401);

    const currentSession = await authed(app, first).get('/api/auth/me');
    expect(currentSession.status).toBe(200);

    const oldPassword = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
    expect(oldPassword.status).toBe(401);

    const newPassword = await request(app).post('/api/auth/login').send({ email: user.email, password: NEW_PASSWORD });
    expect(newPassword.status).toBe(200);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'PASSWORD_CHANGED', actorUserId: user.id } });
    expect(audit).not.toBeNull();
  });

  it('clears the mustChangePassword flag', async () => {
    const user = await createTestUser({ email: 'change4@example.com', mustChangePassword: true });
    const client = await loginAs(app, user.email, TEST_PASSWORD);

    const meBefore = await authed(app, client).get('/api/auth/me');
    expect(meBefore.body.data.user.mustChangePassword).toBe(true);

    await authed(app, client)
      .post('/api/auth/password/change')
      .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD });

    const meAfter = await authed(app, client).get('/api/auth/me');
    expect(meAfter.body.data.user.mustChangePassword).toBe(false);
  });
});

describe('password reset flow', () => {
  it('always answers the same way, but only queues mail for real accounts', async () => {
    await createTestUser({ email: 'real@example.com' });

    const known = await request(app).post('/api/auth/password/forgot').send({ email: 'real@example.com' });
    const unknown = await request(app).post('/api/auth/password/forgot').send({ email: 'nobody@example.com' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);

    expect(await prisma.mailOutbox.count()).toBe(1);
    const mail = await prisma.mailOutbox.findFirstOrThrow();
    expect(mail.toEmail).toBe('real@example.com');
    expect(mail.body).toContain('/reset-password?token=');
  });

  it('resets the password once, revokes sessions and rejects token reuse', async () => {
    const user = await createTestUser({ email: 'reset@example.com' });
    const session = await loginAs(app, user.email, TEST_PASSWORD);

    await request(app).post('/api/auth/password/forgot').send({ email: user.email });
    const mail = await prisma.mailOutbox.findFirstOrThrow();
    const token = /reset-password\?token=([A-Za-z0-9_\-%]+)/.exec(mail.body)?.[1];
    expect(token).toBeTruthy();

    const reset = await request(app)
      .post('/api/auth/password/reset')
      .send({ token: decodeURIComponent(token!), newPassword: NEW_PASSWORD });
    expect(reset.status).toBe(200);

    const oldSession = await authed(app, session).get('/api/auth/me');
    expect(oldSession.status).toBe(401);

    const loginWithNew = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: NEW_PASSWORD });
    expect(loginWithNew.status).toBe(200);

    const reuse = await request(app)
      .post('/api/auth/password/reset')
      .send({ token: decodeURIComponent(token!), newPassword: 'Another_Password_789!' });
    expect(reuse.status).toBe(400);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'PASSWORD_RESET_COMPLETED' } });
    expect(audit).not.toBeNull();
  });

  it('rejects expired reset tokens', async () => {
    const user = await createTestUser({ email: 'expired-reset@example.com' });
    await request(app).post('/api/auth/password/forgot').send({ email: user.email });
    await prisma.passwordResetToken.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const mail = await prisma.mailOutbox.findFirstOrThrow();
    const token = decodeURIComponent(/reset-password\?token=([A-Za-z0-9_\-%]+)/.exec(mail.body)![1]);

    const response = await request(app)
      .post('/api/auth/password/reset')
      .send({ token, newPassword: NEW_PASSWORD });
    expect(response.status).toBe(400);
  });
});

describe('POST /api/auth/register', () => {
  it('is hidden when public registration is disabled', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: NEW_PASSWORD, displayName: 'New User' });
    expect(response.status).toBe(404);
  });

  it('creates a VIEWER account when enabled', async () => {
    (env as { ENABLE_PUBLIC_REGISTRATION: boolean }).ENABLE_PUBLIC_REGISTRATION = true;
    try {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'new@example.com', password: NEW_PASSWORD, displayName: 'New User' });

      expect(response.status).toBe(201);
      expect(response.body.data.user.globalRole).toBe('VIEWER');

      const duplicate = await request(app)
        .post('/api/auth/register')
        .send({ email: 'new@example.com', password: NEW_PASSWORD, displayName: 'New User' });
      expect(duplicate.status).toBe(409);
    } finally {
      (env as { ENABLE_PUBLIC_REGISTRATION: boolean }).ENABLE_PUBLIC_REGISTRATION = false;
    }
  });
});

describe('login rate limiting', () => {
  it('limits failed sign-in attempts per email and IP', async () => {
    await createTestUser({ email: 'ratelimited@example.com' });
    (env as { AUTH_RATE_LIMIT_MAX: number }).AUTH_RATE_LIMIT_MAX = 2;
    try {
      const first = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ratelimited@example.com', password: 'Wrong_Password_1!' });
      const second = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ratelimited@example.com', password: 'Wrong_Password_1!' });
      const third = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ratelimited@example.com', password: 'Wrong_Password_1!' });

      expect([first.status, second.status]).toEqual([401, 401]);
      expect(third.status).toBe(429);
      expect(third.body.error.code).toBe('RATE_LIMITED');
    } finally {
      (env as { AUTH_RATE_LIMIT_MAX: number }).AUTH_RATE_LIMIT_MAX = 1000;
    }
  });
});
