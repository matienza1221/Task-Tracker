import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { authed } from './helpers/auth';
import { createProjectFixture, createTaskFixture } from './helpers/db';
import { createUserWithSession } from './helpers/scenarios';

describe('vocabulary administration', () => {
  it('is restricted to administrators', async () => {
    const { client } = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });

    expect((await authed(app, client).get('/api/admin/vocabularies')).status).toBe(403);
    expect(
      (
        await authed(app, client)
          .post('/api/admin/vocabularies/task-statuses')
          .send({ name: 'Rework', category: 'TODO' })
      ).status,
    ).toBe(403);
  });

  it('lists vocabularies with usage counts and workflow categories', async () => {
    const { user, client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const project = await createProjectFixture({ manager: user, code: 'USAGE' });
    await createTaskFixture({ projectId: project.id, reporter: user, statusKey: 'DONE' });

    const response = await authed(app, client).get('/api/admin/vocabularies');
    expect(response.status).toBe(200);
    expect(response.body.data.taskStatuses).toHaveLength(8);
    expect(response.body.data.taskPriorities).toHaveLength(4);
    expect(response.body.data.taskTypes).toHaveLength(8);
    expect(response.body.data.projectStatuses).toHaveLength(5);
    expect(response.body.data.categories.taskStatuses).toContain('CANCELLED');

    const done = response.body.data.taskStatuses.find((item: { key: string }) => item.key === 'DONE');
    expect(done.usageCount).toBe(1);
    const backlog = response.body.data.taskStatuses.find((item: { key: string }) => item.key === 'BACKLOG');
    expect(backlog.usageCount).toBe(0);
  });

  it('creates entries for every vocabulary kind', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });

    const status = await authed(app, client)
      .post('/api/admin/vocabularies/task-statuses')
      .send({ name: 'Awaiting QA', category: 'REVIEW', color: '#8b5cf6', sortOrder: 45 });
    expect(status.status).toBe(201);
    expect(status.body.data.item.key).toBe('AWAITING_QA');
    expect(status.body.data.item.category).toBe('REVIEW');

    const priority = await authed(app, client)
      .post('/api/admin/vocabularies/task-priorities')
      .send({ name: 'Urgent', weight: 5, color: '#dc2626' });
    expect(priority.status).toBe(201);
    expect(priority.body.data.item.weight).toBe(5);

    const type = await authed(app, client)
      .post('/api/admin/vocabularies/task-types')
      .send({ name: 'Spike', icon: 'search', color: '#0ea5e9' });
    expect(type.status).toBe(201);
    expect(type.body.data.item.icon).toBe('search');

    const projectStatus = await authed(app, client)
      .post('/api/admin/vocabularies/project-statuses')
      .send({ name: 'Discovery', category: 'PLANNING', color: '#8b5cf6' });
    expect(projectStatus.status).toBe(201);

    // The new status is immediately available to forms.
    const meta = await authed(app, client).get('/api/meta/vocabularies');
    expect(meta.body.data.taskStatuses.some((item: { name: string }) => item.name === 'Awaiting QA')).toBe(true);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'VOCABULARY_CHANGED' } });
    expect(audit).not.toBeNull();
  });

  it('validates categories and payloads', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });

    const missingCategory = await authed(app, client)
      .post('/api/admin/vocabularies/task-statuses')
      .send({ name: 'Broken' });
    expect(missingCategory.status).toBe(422);

    const invalidCategory = await authed(app, client)
      .post('/api/admin/vocabularies/task-statuses')
      .send({ name: 'Broken', category: 'SHIPPED' });
    expect(invalidCategory.status).toBe(422);

    const invalidColour = await authed(app, client)
      .post('/api/admin/vocabularies/task-priorities')
      .send({ name: 'Broken', color: 'red' });
    expect(invalidColour.status).toBe(422);

    const unknownField = await authed(app, client)
      .post('/api/admin/vocabularies/task-types')
      .send({ name: 'Broken', isSystem: true });
    expect(unknownField.status).toBe(422);
  });

  it('switches the default entry and protects the current default from deactivation', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const created = await authed(app, client)
      .post('/api/admin/vocabularies/task-statuses')
      .send({ name: 'Ready', category: 'TODO' });
    const newStatusId = created.body.data.item.id as string;

    const promoted = await authed(app, client)
      .patch(`/api/admin/vocabularies/task-statuses/${newStatusId}`)
      .send({ isDefault: true });
    expect(promoted.status).toBe(200);
    expect(promoted.body.data.item.isDefault).toBe(true);

    const defaults = await prisma.taskStatus.findMany({ where: { isDefault: true } });
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(newStatusId);

    const deactivateDefault = await authed(app, client).delete(`/api/admin/vocabularies/task-statuses/${newStatusId}`);
    expect(deactivateDefault.status).toBe(409);

    // The previously default entry can now be deactivated.
    const previousDefault = await prisma.taskStatus.findFirstOrThrow({ where: { key: 'BACKLOG' } });
    const deactivatePrevious = await authed(app, client).delete(
      `/api/admin/vocabularies/task-statuses/${previousDefault.id}`,
    );
    expect(deactivatePrevious.status).toBe(200);

    const stillActive = await prisma.taskStatus.findUniqueOrThrow({ where: { id: previousDefault.id } });
    expect(stillActive.isActive).toBe(false);
  });

  it('deactivates instead of deleting entries that are in use', async () => {
    const { user, client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const project = await createProjectFixture({ manager: user, code: 'INUSE' });

    const created = await authed(app, client)
      .post('/api/admin/vocabularies/task-types')
      .send({ name: 'Spike', icon: 'search' });
    const typeId = created.body.data.item.id as string;
    await createTaskFixture({ projectId: project.id, reporter: user });
    const task = await prisma.task.findFirstOrThrow({ where: { projectId: project.id } });
    await prisma.task.update({ where: { id: task.id }, data: { typeId } });

    const hardDelete = await authed(app, client).delete(
      `/api/admin/vocabularies/task-types/${typeId}?hard=true`,
    );
    expect(hardDelete.status).toBe(409);

    const deactivate = await authed(app, client).delete(`/api/admin/vocabularies/task-types/${typeId}`);
    expect(deactivate.status).toBe(200);
    expect(await prisma.taskType.findUnique({ where: { id: typeId } })).not.toBeNull();

    const meta = await authed(app, client).get('/api/meta/vocabularies');
    expect(meta.body.data.taskTypes.some((item: { id: string }) => item.id === typeId)).toBe(false);
  });

  it('refuses to delete built-in entries and allows deleting unused custom ones', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });

    const system = await prisma.taskStatus.findFirstOrThrow({ where: { key: 'TODO' } });
    const systemDelete = await authed(app, client).delete(
      `/api/admin/vocabularies/task-statuses/${system.id}?hard=true`,
    );
    expect(systemDelete.status).toBe(409);

    const created = await authed(app, client)
      .post('/api/admin/vocabularies/task-types')
      .send({ name: 'Temporary', icon: 'square' });
    const customId = created.body.data.item.id as string;

    const deleted = await authed(app, client).delete(`/api/admin/vocabularies/task-types/${customId}?hard=true`);
    expect(deleted.status).toBe(200);
    expect(await prisma.taskType.findUnique({ where: { id: customId } })).toBeNull();
  });

  it('refuses to deactivate the last active entry', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });

    // Leave exactly one active, non-default, non-system entry.
    await prisma.taskType.updateMany({ where: {}, data: { isActive: false, isDefault: false } });
    const survivor = await prisma.taskType.findFirstOrThrow({ where: { key: 'BUG' } });
    await prisma.taskType.update({ where: { id: survivor.id }, data: { isActive: true, isSystem: false } });

    const response = await authed(app, client).delete(`/api/admin/vocabularies/task-types/${survivor.id}`);
    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('At least one active');
  });

  it('rejects unknown kinds with validation errors', async () => {
    const { client } = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
    const response = await authed(app, client)
      .post('/api/admin/vocabularies/whatever')
      .send({ name: 'Nope', category: 'TODO' });
    expect(response.status).toBe(422);
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/admin/vocabularies');
    expect(response.status).toBe(401);
  });
});
