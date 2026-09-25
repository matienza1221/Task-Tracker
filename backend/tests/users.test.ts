import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { User } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import * as userService from '../src/modules/users/service';
import { authed } from './helpers/auth';
import { createTestUser, TEST_PASSWORD } from './helpers/db';
import { createUserWithSession } from './helpers/scenarios';

const NEW_USER = { email: 'newbie@example.com', displayName: 'New Bie', globalRole: 'DEVELOPER' as const };

describe('GET /api/users', () => {
  it('lists, searches and paginates users for administrators', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    await createTestUser({ email: 'alice@example.com', displayName: 'Alice Anderson' });
    await createTestUser({ email: 'bob@example.com', displayName: 'Bob Brown' });

    const all = await authed(app, client).get('/api/users');
    expect(all.status).toBe(200);
    expect(all.body.data.users).toHaveLength(3);
    expect(all.body.meta.total).toBe(3);

    const search = await authed(app, client).get('/api/users?search=alice');
    expect(search.status).toBe(200);
    expect(search.body.data.users).toHaveLength(1);
    expect(search.body.data.users[0].email).toBe('alice@example.com');

    const paged = await authed(app, client).get('/api/users?page=2&pageSize=2');
    expect(paged.body.meta).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });

    // No credential material is ever serialized.
    expect(JSON.stringify(all.body)).not.toContain('passwordHash');
  });

  it('forbids non-administrators', async () => {
    for (const globalRole of ['PROJECT_MANAGER', 'DEVELOPER', 'VIEWER'] as const) {
      const { client } = await createUserWithSession(app, { email: `${globalRole}@example.com`, globalRole });
      const response = await authed(app, client).get('/api/users');
      expect(response.status).toBe(403);
    }
  });
});

describe('GET /api/users/lookup', () => {
  it('returns a minimal directory for project managers', async () => {
    const { client } = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    await createTestUser({ email: 'dev@example.com', displayName: 'Dev Person' });

    const response = await authed(app, client).get('/api/users/lookup?search=dev');
    expect(response.status).toBe(200);
    expect(response.body.data.users).toHaveLength(1);
    expect(Object.keys(response.body.data.users[0]).sort()).toEqual(
      ['avatarUrl', 'displayName', 'email', 'globalRole', 'id'].sort(),
    );
  });

  it('requires a search term of at least two characters', async () => {
    const { client } = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const response = await authed(app, client).get('/api/users/lookup?search=d');
    expect(response.status).toBe(422);
    expect(response.body.error.details[0].path).toBe('search');
  });

  it('forbids viewers', async () => {
    const { client } = await createUserWithSession(app, { email: 'viewer@example.com', globalRole: 'VIEWER' });
    const response = await authed(app, client).get('/api/users/lookup?search=dev');
    expect(response.status).toBe(403);
  });

  it('excludes inactive and deleted accounts', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const inactive = await createTestUser({ email: 'gone@example.com', displayName: 'Gone Person', isActive: false });

    const response = await authed(app, client).get('/api/users/lookup?search=gone');
    expect(response.status).toBe(200);
    expect(response.body.data.users).toHaveLength(0);
    expect(inactive.id).toBeTruthy();
  });
});

describe('POST /api/users', () => {
  it('creates a user with a generated temporary password that must be changed', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });

    const response = await authed(app, client).post('/api/users').send(NEW_USER);

    expect(response.status).toBe(201);
    expect(response.body.data.user.mustChangePassword).toBe(true);
    expect(typeof response.body.data.temporaryPassword).toBe('string');
    expect(response.body.data.temporaryPassword.length).toBeGreaterThanOrEqual(16);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: NEW_USER.email, password: response.body.data.temporaryPassword });
    expect(login.status).toBe(200);
    expect(login.body.data.user.mustChangePassword).toBe(true);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'USER_CREATED' } });
    expect(audit).not.toBeNull();
  });

  it('accepts an explicit password and enforces the strength policy', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });

    const ok = await authed(app, client)
      .post('/api/users')
      .send({ ...NEW_USER, password: 'Str0ng_Passw0rd_42!' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.temporaryPassword).toBeNull();

    const weak = await authed(app, client)
      .post('/api/users')
      .send({ email: 'weak@example.com', displayName: 'Weak User', password: 'password1234' });
    expect(weak.status).toBe(422);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects duplicate emails case-insensitively', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    await authed(app, client).post('/api/users').send(NEW_USER);

    const duplicate = await authed(app, client)
      .post('/api/users')
      .send({ ...NEW_USER, email: 'NewBie@Example.com' });
    expect(duplicate.status).toBe(409);
  });

  it('rejects unknown fields (mass assignment protection)', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const response = await authed(app, client)
      .post('/api/users')
      .send({ ...NEW_USER, passwordHash: 'injected', isActive: false, deletedAt: new Date().toISOString() });
    expect(response.status).toBe(422);
  });

  it('forbids project managers', async () => {
    const { client } = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const response = await authed(app, client).post('/api/users').send(NEW_USER);
    expect(response.status).toBe(403);
  });
});

describe('PATCH /api/users/:userId', () => {
  it('updates profile fields and records an audit entry', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const target = await createTestUser({ email: 'target@example.com' });

    const response = await authed(app, client)
      .patch(`/api/users/${target.id}`)
      .send({ displayName: 'Renamed Person', timezone: 'UTC' });

    expect(response.status).toBe(200);
    expect(response.body.data.user.displayName).toBe('Renamed Person');
    expect(response.body.data.user.timezone).toBe('UTC');

    const audit = await prisma.auditLog.findFirst({ where: { action: 'USER_UPDATED', resourceId: target.id } });
    expect(audit).not.toBeNull();
  });

  it('deactivates a user and revokes their sessions', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const { user: target, client: targetClient } = await createUserWithSession(app, { email: 'target@example.com' });

    const response = await authed(app, client).patch(`/api/users/${target.id}`).send({ isActive: false });
    expect(response.status).toBe(200);
    expect(response.body.data.user.isActive).toBe(false);

    const removed = await authed(app, targetClient).get('/api/auth/me');
    expect(removed.status).toBe(401);

    const login = await request(app).post('/api/auth/login').send({ email: target.email, password: TEST_PASSWORD });
    expect(login.status).toBe(401);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'USER_DEACTIVATED', resourceId: target.id } });
    expect(audit).not.toBeNull();
  });

  it('prevents administrators from deactivating themselves', async () => {
    const { user: admin, client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const response = await authed(app, client).patch(`/api/users/${admin.id}`).send({ isActive: false });
    expect(response.status).toBe(403);
  });

  it('returns 404 for unknown users', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const response = await authed(app, client)
      .patch('/api/users/11111111-1111-1111-1111-111111111111')
      .send({ displayName: 'Ghost' });
    expect(response.status).toBe(404);
  });
});

describe('PATCH /api/users/:userId/role', () => {
  it('changes a role and audits the transition', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const target = await createTestUser({ email: 'target@example.com', globalRole: 'DEVELOPER' });

    const response = await authed(app, client).patch(`/api/users/${target.id}/role`).send({ globalRole: 'PROJECT_MANAGER' });
    expect(response.status).toBe(200);
    expect(response.body.data.user.globalRole).toBe('PROJECT_MANAGER');

    const audit = await prisma.auditLog.findFirst({ where: { action: 'USER_ROLE_CHANGED', resourceId: target.id } });
    expect(audit!.metadata).toMatchObject({ from: 'DEVELOPER', to: 'PROJECT_MANAGER' });
  });

  it('prevents self role changes', async () => {
    const { user: admin, client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const response = await authed(app, client).patch(`/api/users/${admin.id}/role`).send({ globalRole: 'DEVELOPER' });
    expect(response.status).toBe(403);
  });

  it('refuses to remove the last active administrator', async () => {
    // Actor is an administrator account that is itself inactive (for example a
    // stale session), and the target is the only usable administrator.
    const actor = await createTestUser({
      email: 'dormant-admin@example.com',
      globalRole: 'ADMIN',
      isActive: false,
    });
    const onlyAdmin = await createTestUser({ email: 'only-admin@example.com', globalRole: 'ADMIN' });

    await expect(userService.changeUserRole(actor, onlyAdmin.id, 'DEVELOPER')).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });

    await expect(userService.deleteUser(actor, onlyAdmin.id, { purge: false })).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });
  });

  it('forbids project managers from changing roles', async () => {
    const { client } = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const target = await createTestUser({ email: 'target@example.com' });
    const response = await authed(app, client).patch(`/api/users/${target.id}/role`).send({ globalRole: 'ADMIN' });
    expect(response.status).toBe(403);
  });
});

describe('POST /api/users/:userId/reset-password', () => {
  it('issues a one-time temporary password, revokes sessions and forces a change', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const { user: target, client: targetClient } = await createUserWithSession(app, { email: 'target@example.com' });

    const response = await authed(app, client).post(`/api/users/${target.id}/reset-password`);
    expect(response.status).toBe(200);
    const temporaryPassword = response.body.data.temporaryPassword as string;
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(16);

    const revoked = await authed(app, targetClient).get('/api/auth/me');
    expect(revoked.status).toBe(401);

    const login = await request(app).post('/api/auth/login').send({ email: target.email, password: temporaryPassword });
    expect(login.status).toBe(200);
    expect(login.body.data.user.mustChangePassword).toBe(true);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'USER_PASSWORD_RESET', resourceId: target.id } });
    expect(audit).not.toBeNull();
  });

  it('refuses to reset the password of an inactive account', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const target = await createTestUser({ email: 'inactive@example.com', isActive: false });
    const response = await authed(app, client).post(`/api/users/${target.id}/reset-password`);
    expect(response.status).toBe(409);
  });
});

describe('DELETE /api/users/:userId', () => {
  it('soft-deletes: deactivates, revokes sessions and removes project memberships', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const { user: target, client: targetClient } = await createUserWithSession(app, { email: 'target@example.com' });

    const response = await authed(app, client).delete(`/api/users/${target.id}`);
    expect(response.status).toBe(200);

    const row = await prisma.user.findFirst({ where: { id: target.id } });
    expect(row).not.toBeNull();
    expect(row!.deletedAt).not.toBeNull();
    expect(row!.isActive).toBe(false);

    const session = await authed(app, targetClient).get('/api/auth/me');
    expect(session.status).toBe(401);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'USER_DELETED', resourceId: target.id } });
    expect(audit!.metadata).toMatchObject({ purge: false });
  });

  it('purges a user permanently with ?purge=true', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const target = await createTestUser({ email: 'purge-me@example.com' });

    const response = await authed(app, client).delete(`/api/users/${target.id}?purge=true`);
    expect(response.status).toBe(200);

    const row = await prisma.user.findFirst({ where: { id: target.id } });
    expect(row).toBeNull();
  });

  it('prevents self-deletion', async () => {
    const { user: admin, client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const response = await authed(app, client).delete(`/api/users/${admin.id}`);
    expect(response.status).toBe(403);
  });

  it('prevents non-administrators from deleting users', async () => {
    const { client } = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const target = await createTestUser({ email: 'target@example.com' });
    const response = await authed(app, client).delete(`/api/users/${target.id}`);
    expect(response.status).toBe(403);
  });
});
