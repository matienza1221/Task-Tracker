import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { authed } from './helpers/auth';
import { createProjectFixture, createTaskFixture } from './helpers/db';
import { createUserWithSession } from './helpers/scenarios';

describe('admin audit log', () => {
  it('is restricted to administrators with audit:view', async () => {
    const admin = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const developer = await createUserWithSession(app, { email: 'dev@example.com', globalRole: 'DEVELOPER' });

    expect((await authed(app, admin.client).get('/api/admin/audit-logs')).status).toBe(200);
    expect((await authed(app, pm.client).get('/api/admin/audit-logs')).status).toBe(403);
    expect((await authed(app, developer.client).get('/api/admin/audit-logs')).status).toBe(403);
    expect((await request(app).get('/api/admin/audit-logs')).status).toBe(401);
  });

  it('lists newest first with pagination and filters', async () => {
    const admin = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const project = await createProjectFixture({ manager: admin.user, code: 'AUDIT' });
    // Created through the API so the audit trail actually records it.
    const createdTask = await authed(app, admin.client)
      .post(`/api/projects/${project.id}/tasks`)
      .send({ title: 'Audited task' });
    expect(createdTask.status).toBe(201);

    const all = await authed(app, admin.client).get('/api/admin/audit-logs?pageSize=100');
    expect(all.status).toBe(200);
    expect(all.body.data.auditLogs.length).toBeGreaterThan(0);
    expect(all.body.meta.total).toBeGreaterThan(0);

    const timestamps = all.body.data.auditLogs.map((row: { createdAt: string }) => row.createdAt);
    expect([...timestamps].sort().reverse()).toEqual(timestamps);

    const created = await authed(app, admin.client).get('/api/admin/audit-logs?action=TASK_CREATED');
    expect(created.body.data.auditLogs.every((row: { action: string }) => row.action === 'TASK_CREATED')).toBe(true);
    expect(created.body.data.auditLogs.length).toBeGreaterThan(0);

    const byActor = await authed(app, admin.client).get('/api/admin/audit-logs?actorEmail=admin@example.com');
    expect(byActor.body.data.auditLogs.length).toBeGreaterThan(0);

    const byResource = await authed(app, admin.client).get('/api/admin/audit-logs?resourceType=task');
    expect(byResource.body.data.auditLogs.every((row: { resourceType: string }) => row.resourceType === 'task')).toBe(true);

    const future = await authed(app, admin.client).get('/api/admin/audit-logs?from=2099-01-01');
    expect(future.body.data.auditLogs).toHaveLength(0);

    const paged = await authed(app, admin.client).get('/api/admin/audit-logs?pageSize=2&page=1');
    expect(paged.body.data.auditLogs).toHaveLength(2);
    expect(paged.body.meta).toMatchObject({ page: 1, pageSize: 2 });

    const invalidAction = await authed(app, admin.client).get('/api/admin/audit-logs?action=NOT_REAL');
    expect(invalidAction.status).toBe(422);
  });

  it('exports CSV with escaped values and download headers', async () => {
    const admin = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    await prisma.auditLog.create({
      data: {
        action: 'SETTINGS_CHANGED',
        actorEmail: 'admin@example.com',
        resourceType: 'settings',
        resourceId: 'tricky',
        metadata: { note: 'contains, comma and "quotes"' },
        ip: '127.0.0.1',
      },
    });

    const response = await authed(app, admin.client).get('/api/admin/audit-logs?format=csv');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment;');
    expect(response.headers['x-content-type-options']).toBe('nosniff');

    const csv = response.text;
    expect(csv.split('\n')[0]).toBe('timestamp,action,actor_email,actor_id,resource_type,resource_id,ip,user_agent,metadata');
    expect(csv).toContain('SETTINGS_CHANGED');
    // The metadata cell contains a comma and quotes, so it is wrapped in quotes
    // and every embedded quote is doubled.
    expect(csv).toContain('contains, comma');
    expect(csv).toContain('""note""');
  });

  it('exposes the distinct action list for the filter UI', async () => {
    const admin = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const project = await createProjectFixture({ manager: admin.user, code: 'ACTIONS' });
    await createTaskFixture({ projectId: project.id, reporter: admin.user });

    await authed(app, admin.client).post(`/api/projects/${project.id}/tasks`).send({ title: 'Audited for actions' });

    const response = await authed(app, admin.client).get('/api/admin/audit-logs/actions');
    expect(response.status).toBe(200);
    expect(response.body.data.actions).toContain('TASK_CREATED');
    expect(response.body.data.actions).toContain('LOGIN');
  });

  it('remains append-only: no mutating routes exist', async () => {
    const admin = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });

    const patch = await authed(app, admin.client)
      .patch('/api/admin/audit-logs/11111111-1111-1111-1111-111111111111')
      .send({ action: 'LOGIN' });
    const remove = await authed(app, admin.client).delete('/api/admin/audit-logs');
    const post = await authed(app, admin.client).post('/api/admin/audit-logs').send({ action: 'LOGIN' });

    expect([patch.status, remove.status, post.status]).toEqual([404, 404, 404]);
  });
});
