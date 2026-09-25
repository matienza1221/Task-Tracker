import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Attachment, User } from '@prisma/client';
import { filetypeinfo } from 'magic-bytes.js';
import { prisma } from '../../db/prisma';
import { env } from '../../config/env';
import { AppError, forbidden, notFound, validationError } from '../../lib/errors';
import { getStorage } from '../../lib/storage';
import { loadTaskForPermission } from '../../lib/resourceGuards';
import { getProjectAccess, projectRoleHasPermission } from '../../lib/access';
import { recordActivity } from '../activity/service';
import { recordAudit } from '../audit/service';

/**
 * Allowlist by *detected* content type (magic bytes), not by extension.
 * Plain-text formats have no magic bytes and are handled separately.
 */
const ALLOWED_MIME = new Map<string, string>([
  ['application/pdf', 'pdf'],
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
  ['application/zip', 'zip'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
]);

/** Distinguished from a plain zip by the uploaded extension. */
const OOXML_BY_EXTENSION = new Map<string, { mime: string }>([
  ['xlsx', { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }],
  ['docx', { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
]);

const TEXT_EXTENSIONS = new Map<string, string>([
  ['txt', 'text/plain'],
  ['md', 'text/markdown'],
  ['csv', 'text/csv'],
  ['json', 'application/json'],
  ['yaml', 'application/yaml'],
  ['yml', 'application/yaml'],
  ['log', 'text/plain'],
]);

export interface AttachmentDto {
  id: string;
  taskId: string | null;
  projectId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  uploadedBy: { id: string; displayName: string; avatarUrl: string | null };
  isOwner: boolean;
  createdAt: string;
}

type AttachmentWithUploader = Attachment & { uploader: { id: string; displayName: string; avatarUrl: string | null } };

const attachmentInclude = {
  uploader: { select: { id: true, displayName: true, avatarUrl: true } },
} as const;

function toDto(attachment: AttachmentWithUploader, currentUserId: string): AttachmentDto {
  return {
    id: attachment.id,
    taskId: attachment.taskId,
    projectId: attachment.projectId,
    filename: attachment.originalFilename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    checksumSha256: attachment.checksumSha256,
    uploadedBy: attachment.uploader,
    isOwner: attachment.uploaderId === currentUserId,
    createdAt: attachment.createdAt.toISOString(),
  };
}

/** Removes any path component and control characters from a user filename. */
export function sanitizeFilename(filename: string): string {
  const base = path.basename(filename.replace(/\\/g, '/'));
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\:*?"<>|]/g, '_')
    .trim();
  const safe = cleaned.length > 0 ? cleaned : 'attachment';
  return safe.slice(0, 200);
}

function extensionOf(filename: string): string {
  const ext = path.extname(filename).replace('.', '').toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : '';
}

function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 8192);
  return sample.includes(0);
}

/** Attachment → project → permission resolution. */
async function loadAttachment(user: User, attachmentId: string, permission: 'attachment:download' | 'attachment:delete_own' | 'attachment:moderate') {
  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, deletedAt: null },
    include: attachmentInclude,
  });
  if (!attachment) throw notFound('Attachment not found.');

  const access = await getProjectAccess(user, attachment.projectId);
  if (!access) throw notFound('Attachment not found.');

  if (permission === 'attachment:download') {
    if (!projectRoleHasPermission(access.role, 'attachment:download')) throw forbidden();
    return attachment;
  }

  const isUploader = attachment.uploaderId === user.id;
  const canModerate = projectRoleHasPermission(access.role, 'attachment:moderate');
  if (canModerate) return attachment;
  if (!isUploader || !projectRoleHasPermission(access.role, 'attachment:delete_own')) throw forbidden();
  return attachment;
}

export async function listAttachments(
  user: User,
  taskId: string,
  options: { page: number; pageSize: number },
): Promise<{ items: AttachmentDto[]; total: number }> {
  const { task } = await loadTaskForPermission(user, taskId, 'attachment:download');
  const where = { taskId: task.id, deletedAt: null };
  const [rows, total] = await Promise.all([
    prisma.attachment.findMany({
      where,
      include: attachmentInclude,
      orderBy: { createdAt: 'desc' },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
    prisma.attachment.count({ where }),
  ]);
  return { items: rows.map((row) => toDto(row, user.id)), total };
}

export interface UploadInput {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export async function uploadAttachment(user: User, taskId: string, file: UploadInput): Promise<AttachmentDto> {
  const { task } = await loadTaskForPermission(user, taskId, 'attachment:upload');

  const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
  if (file.size <= 0) throw validationError('The uploaded file is empty.');
  if (file.size > maxBytes) {
    throw new AppError(413, 'PAYLOAD_TOO_LARGE', `Files must be ${env.MAX_UPLOAD_MB} MB or smaller.`);
  }

  const filename = sanitizeFilename(file.originalname);
  const extensionFromName = extensionOf(filename);
  const detected = filetypeinfo(file.buffer)[0];

  let mimeType: string;
  let extension: string;

  if (detected?.mime) {
    // OOXML files are ZIP containers; trust the extension only to tell
    // xlsx/docx apart from a plain archive (they remain zip-validated either way).
    const ooxml = detected.mime === 'application/zip' ? OOXML_BY_EXTENSION.get(extensionFromName) : undefined;
    const detectedMime = ooxml?.mime ?? detected.mime;
    const allowedExtension = ALLOWED_MIME.get(detectedMime);
    if (!allowedExtension) {
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', `Files of type “${detectedMime}” are not allowed.`);
    }
    mimeType = detectedMime;
    extension = allowedExtension;
  } else {
    // No magic bytes: only plain-text formats, and the content must look textual.
    const textMime = TEXT_EXTENSIONS.get(extensionFromName);
    if (!textMime) {
      throw new AppError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Unsupported file type. Allowed: PDF, PNG, JPG, GIF, WEBP, ZIP, XLSX, DOCX, TXT, MD, CSV, JSON, YAML, LOG.',
      );
    }
    if (looksBinary(file.buffer)) {
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'The file content does not match a text format.');
    }
    mimeType = textMime;
    extension = extensionFromName;
  }

  const storedKey = `${task.projectId}/${randomUUID()}.${extension}`;
  const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');

  await getStorage().put(storedKey, file.buffer);

  const attachment = await prisma.attachment.create({
    data: {
      projectId: task.projectId,
      taskId: task.id,
      uploaderId: user.id,
      originalFilename: filename,
      storedKey,
      mimeType,
      sizeBytes: file.size,
      checksumSha256,
      storageProvider: getStorage().kind,
    },
    include: attachmentInclude,
  });

  await recordActivity({
    projectId: task.projectId,
    taskId: task.id,
    actor: user,
    action: 'ATTACHMENT_UPLOADED',
    metadata: { key: task.key, attachmentId: attachment.id, filename, sizeBytes: file.size },
  });
  await recordAudit({
    action: 'ATTACHMENT_UPLOADED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'attachment',
    resourceId: attachment.id,
    metadata: { projectId: task.projectId, taskId: task.id, filename, mimeType, sizeBytes: file.size },
  });

  return toDto(attachment, user.id);
}

export async function downloadAttachment(
  user: User,
  attachmentId: string,
): Promise<{ attachment: Attachment; data: Buffer }> {
  const attachment = await loadAttachment(user, attachmentId, 'attachment:download');
  let data: Buffer;
  try {
    data = await getStorage().get(attachment.storedKey);
  } catch {
    throw notFound('The stored file is no longer available.');
  }

  await recordAudit({
    action: 'ATTACHMENT_UPLOADED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'attachment',
    resourceId: attachment.id,
    metadata: { downloaded: true },
  });

  return { attachment, data };
}

export async function deleteAttachment(user: User, attachmentId: string): Promise<void> {
  const attachment = await loadAttachment(user, attachmentId, 'attachment:delete_own');

  await prisma.attachment.update({ where: { id: attachment.id }, data: { deletedAt: new Date() } });
  try {
    await getStorage().delete(attachment.storedKey);
  } catch {
    // The row is gone for users either way; orphaned blobs are cleaned by ops.
  }

  await recordActivity({
    projectId: attachment.projectId,
    taskId: attachment.taskId,
    actor: user,
    action: 'ATTACHMENT_DELETED',
    metadata: { attachmentId: attachment.id, filename: attachment.originalFilename },
  });
  await recordAudit({
    action: 'ATTACHMENT_DELETED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'attachment',
    resourceId: attachment.id,
    metadata: { projectId: attachment.projectId },
  });
}
