import type { Request, Response } from 'express';
import { asyncHandler, unauthenticated, validationError } from '../../lib/errors';
import { paginationMeta, sendSuccess } from '../../lib/response';
import { validatedParams, validatedQuery } from '../../middleware/validate';
import * as service from './service';

export const listTaskAttachments = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { taskId } = validatedParams<{ taskId: string }>(req);
  const query = validatedQuery<{ page: number; pageSize: number }>(req);
  const { items, total } = await service.listAttachments(req.user, taskId, query);
  sendSuccess(res, { attachments: items }, { meta: paginationMeta(query.page, query.pageSize, total) });
});

export const upload = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { taskId } = validatedParams<{ taskId: string }>(req);
  const file = req.file;
  if (!file) {
    throw validationError('Attach a file in the “file” field.', [{ path: 'file', message: 'No file received.' }]);
  }
  const attachment = await service.uploadAttachment(req.user, taskId, {
    buffer: file.buffer,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  });
  sendSuccess(res, { attachment }, { status: 201, message: 'Attachment uploaded.' });
});

export const download = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { attachmentId } = validatedParams<{ attachmentId: string }>(req);
  const { attachment, data } = await service.downloadAttachment(req.user, attachmentId);

  // Files are always served as downloads with hardened headers so a crafted
  // upload can never execute in the browser (ARCHITECTURE.md §10).
  const asciiName = attachment.originalFilename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader('Content-Length', String(data.length));
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(attachment.originalFilename)}`,
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(data);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { attachmentId } = validatedParams<{ attachmentId: string }>(req);
  await service.deleteAttachment(req.user, attachmentId);
  sendSuccess(res, null, { message: 'Attachment deleted.' });
});
