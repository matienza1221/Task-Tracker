import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { env } from '../src/config/env';
import { prisma } from '../src/db/prisma';
import { authed } from './helpers/auth';
import { createProjectFixture, createTaskFixture } from './helpers/db';
import { createUserWithSession } from './helpers/scenarios';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0x00, 0x00, 0x00, 0x0d]),
  Buffer.from('IHDR'),
  Buffer.from([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00]),
]);
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const HTML = Buffer.from('<!doctype html><script>alert(1)</script>');

async function scenario() {
  const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
  const developer = await createUserWithSession(app, { email: 'dev@example.com', globalRole: 'DEVELOPER' });
  const viewer = await createUserWithSession(app, { email: 'viewer@example.com', globalRole: 'VIEWER' });
  const outsider = await createUserWithSession(app, { email: 'outsider@example.com', globalRole: 'DEVELOPER' });
  const project = await createProjectFixture({ manager: pm.user, code: 'FILES' });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: developer.user.id, projectRole: 'DEVELOPER' } });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: viewer.user.id, projectRole: 'VIEWER' } });
  const task = await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Attach things' });
  return { pm, developer, viewer, outsider, project, task };
}

function upload(client: Awaited<ReturnType<typeof createUserWithSession>>['client'], taskId: string, buffer: Buffer, filename: string) {
  return authed(app, client)
    .post(`/api/tasks/${taskId}/attachments`)
    .attach('file', buffer, filename);
}

describe('attachment upload', () => {
  it('accepts an image detected by content type and records metadata', async () => {
    const { developer, task } = await scenario();

    const response = await upload(developer.client, task.id, PNG, 'screenshot.png');

    expect(response.status).toBe(201);
    expect(response.body.data.attachment).toMatchObject({
      filename: 'screenshot.png',
      mimeType: 'image/png',
      sizeBytes: PNG.length,
    });
    expect(response.body.data.attachment.checksumSha256).toMatch(/^[0-9a-f]{64}$/);

    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: response.body.data.attachment.id } });
    expect(row.storedKey).toMatch(new RegExp(`^${row.projectId}/[0-9a-f-]{36}\\.png$`));
    expect(existsSync(path.resolve(process.cwd(), env.UPLOAD_DIR, row.storedKey))).toBe(true);

    expect(await prisma.activityLog.count({ where: { action: 'ATTACHMENT_UPLOADED' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'ATTACHMENT_UPLOADED' } })).toBe(1);
  });

  it('accepts PDFs and plain-text formats', async () => {
    const { developer, task } = await scenario();

    const pdf = await upload(developer.client, task.id, PDF, 'spec.pdf');
    expect(pdf.status).toBe(201);
    expect(pdf.body.data.attachment.mimeType).toBe('application/pdf');

    const text = await upload(developer.client, task.id, Buffer.from('notes\n'), 'notes.md');
    expect(text.status).toBe(201);
    expect(text.body.data.attachment.mimeType).toBe('text/markdown');

    const log = await upload(developer.client, task.id, Buffer.from('server started\n'), 'server.log');
    expect(log.status).toBe(201);
    expect(log.body.data.attachment.mimeType).toBe('text/plain');
  });

  it('rejects disallowed types, spoofed extensions and binary content in text files', async () => {
    const { developer, task } = await scenario();

    const html = await upload(developer.client, task.id, HTML, 'page.html');
    expect(html.status).toBe(415);
    expect(html.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');

    // HTML renamed to .png: no image magic bytes and the extension is not allowed.
    const spoofed = await upload(developer.client, task.id, HTML, 'avatar.png');
    expect(spoofed.status).toBe(415);

    // A PNG renamed to .txt is still detected as an image (allowed) but the
    // stored extension follows the detected type.
    const pngAsText = await upload(developer.client, task.id, PNG, 'image.txt');
    expect(pngAsText.status).toBe(201);
    expect(pngAsText.body.data.attachment.mimeType).toBe('image/png');

    // Binary content with a text extension is rejected.
    const binary = Buffer.concat([Buffer.from('PK'), Buffer.from([0x00, 0x01, 0x02, 0x03])]);
    const fakeText = await upload(developer.client, task.id, binary, 'data.txt');
    expect(fakeText.status).toBe(415);

    expect(await prisma.attachment.count()).toBe(1);
  });

  it('sanitises filenames and enforces the size limit', async () => {
    const { developer, task } = await scenario();

    const traversal = await upload(developer.client, task.id, PNG, '../../../etc/passwd.png');
    expect(traversal.status).toBe(201);
    expect(traversal.body.data.attachment.filename).toBe('passwd.png');

    const oversized = Buffer.concat([PNG, Buffer.alloc(env.MAX_UPLOAD_MB * 1024 * 1024)]);
    const tooBig = await upload(developer.client, task.id, oversized, 'huge.png');
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('requires task:upload and project visibility', async () => {
    const { viewer, outsider, task } = await scenario();

    const asViewer = await upload(viewer.client, task.id, PNG, 'readonly.png');
    expect(asViewer.status).toBe(403);

    const asOutsider = await upload(outsider.client, task.id, PNG, 'intruder.png');
    expect(asOutsider.status).toBe(404);

    expect(await prisma.attachment.count()).toBe(0);
  });
});

describe('attachment download and deletion', () => {
  it('serves authorised downloads as attachments with hardened headers', async () => {
    const { developer, viewer, outsider, task } = await scenario();
    const uploaded = await upload(developer.client, task.id, PDF, 'report.pdf');
    const attachmentId = uploaded.body.data.attachment.id;

    const asDeveloper = await authed(app, developer.client).get(`/api/attachments/${attachmentId}/download`);
    expect(asDeveloper.status).toBe(200);
    expect(asDeveloper.headers['content-type']).toContain('application/pdf');
    expect(asDeveloper.headers['content-disposition']).toContain('attachment;');
    expect(asDeveloper.headers['x-content-type-options']).toBe('nosniff');
    expect(asDeveloper.headers['content-security-policy']).toContain('sandbox');
    expect(asDeveloper.body.length).toBe(PDF.length);

    const asViewer = await authed(app, viewer.client).get(`/api/attachments/${attachmentId}/download`);
    expect(asViewer.status).toBe(200);

    const asOutsider = await authed(app, outsider.client).get(`/api/attachments/${attachmentId}/download`);
    expect(asOutsider.status).toBe(404);

    const unknown = await authed(app, developer.client).get(
      '/api/attachments/11111111-1111-1111-1111-111111111111/download',
    );
    expect(unknown.status).toBe(404);
  });

  it('lists attachments per task and hides them from outsiders', async () => {
    const { developer, outsider, task } = await scenario();
    await upload(developer.client, task.id, PNG, 'one.png');
    await upload(developer.client, task.id, PDF, 'two.pdf');

    const list = await authed(app, developer.client).get(`/api/tasks/${task.id}/attachments`);
    expect(list.status).toBe(200);
    expect(list.body.data.attachments).toHaveLength(2);
    expect(list.body.meta.total).toBe(2);

    const hidden = await authed(app, outsider.client).get(`/api/tasks/${task.id}/attachments`);
    expect(hidden.status).toBe(404);
  });

  it('lets uploaders delete their own files and moderators delete any file', async () => {
    const { pm, developer, viewer, task } = await scenario();
    const own = await upload(developer.client, task.id, PNG, 'mine.png');
    const someoneElse = await upload(developer.client, task.id, PNG, 'theirs.png');

    const otherDeveloper = await createUserWithSession(app, { email: 'dev2@example.com', globalRole: 'DEVELOPER' });
    await prisma.projectMember.create({
      data: { projectId: task.projectId, userId: otherDeveloper.user.id, projectRole: 'DEVELOPER' },
    });

    const byOther = await authed(app, otherDeveloper.client).delete(`/api/attachments/${own.body.data.attachment.id}`);
    expect(byOther.status).toBe(403);

    const byViewer = await authed(app, viewer.client).delete(`/api/attachments/${own.body.data.attachment.id}`);
    expect(byViewer.status).toBe(403);

    const byOwner = await authed(app, developer.client).delete(`/api/attachments/${own.body.data.attachment.id}`);
    expect(byOwner.status).toBe(200);

    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: own.body.data.attachment.id } });
    expect(row.deletedAt).not.toBeNull();

    const byModerator = await authed(app, pm.client).delete(`/api/attachments/${someoneElse.body.data.attachment.id}`);
    expect(byModerator.status).toBe(200);

    expect(await prisma.activityLog.count({ where: { action: 'ATTACHMENT_DELETED' } })).toBe(2);
    const list = await authed(app, pm.client).get(`/api/tasks/${task.id}/attachments`);
    expect(list.body.data.attachments).toHaveLength(0);
  });

  it('refuses downloads of deleted attachments', async () => {
    const { developer, task } = await scenario();
    const uploaded = await upload(developer.client, task.id, PNG, 'temp.png');
    const attachmentId = uploaded.body.data.attachment.id;

    await authed(app, developer.client).delete(`/api/attachments/${attachmentId}`);
    const download = await authed(app, developer.client).get(`/api/attachments/${attachmentId}/download`);
    expect(download.status).toBe(404);
  });
});
