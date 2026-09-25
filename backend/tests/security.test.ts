import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { createTestUser, TEST_PASSWORD } from './helpers/db';
import { loginAs } from './helpers/auth';

describe('security headers', () => {
  it('sets hardened headers on API responses', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('returns a request id header', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers['x-request-id']).toBeTruthy();
  });
});

describe('CORS', () => {
  it('allows credentials from the configured origin', async () => {
    const response = await request(app).get('/api/health').set('Origin', 'https://app.example.com');
    expect(response.headers['access-control-allow-origin']).toBe('https://app.example.com');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not echo unknown origins', async () => {
    const response = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('response hygiene', () => {
  it('never returns password material', async () => {
    const user = await createTestUser({ email: 'leak-check@example.com' });
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('argon2');
    expect(serialized).not.toContain(user.passwordHash);
    expect(serialized).not.toContain(TEST_PASSWORD);
  });
});

describe('error envelopes', () => {
  it('returns 404 for unknown API routes', async () => {
    const response = await request(app).get('/api/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for malformed JSON', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('exposes the audit log to nobody (no mutating routes exist)', async () => {
    await createTestUser({ email: 'auditor@example.com', globalRole: 'ADMIN' });
    const client = await loginAs(app, 'auditor@example.com', TEST_PASSWORD);

    const patch = await request(app)
      .patch('/api/audit-logs/00000000-0000-0000-0000-000000000000')
      .set('Cookie', client.cookieHeader)
      .set('X-CSRF-Token', client.csrfToken)
      .send({ action: 'LOGIN' });
    expect(patch.status).toBe(404);

    const remove = await request(app)
      .delete('/api/audit-logs')
      .set('Cookie', client.cookieHeader)
      .set('X-CSRF-Token', client.csrfToken);
    expect(remove.status).toBe(404);
  });
});

describe('GET /api/health', () => {
  it('reports database connectivity', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
    expect(response.body.data.database).toBe('up');
  });

  it('does not require authentication and leaks no configuration', async () => {
    const response = await request(app).get('/api/health');
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('postgresql://');
    expect(serialized).not.toContain('DATABASE_URL');
    expect(serialized).not.toContain('SEED_ADMIN');
    expect(await prisma.user.count()).toBe(0);
  });
});
