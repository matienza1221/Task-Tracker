import type { Request, Response } from 'express';
import type { NextFunction, RequestHandler } from 'express';
import multer from 'multer';
import { env } from '../../config/env';
import { AppError, asyncHandler, unauthenticated, validationError } from '../../lib/errors';
import { paginationMeta, sendSuccess } from '../../lib/response';
import { validatedBody, validatedParams, validatedQuery } from '../../middleware/validate';
import * as service from './service';
import type { PreviewInput } from './schemas';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 5 },
});

const singleFile: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (error: unknown) => {
    if (!error) return next();
    const code = (error as { code?: string }).code;
    if (code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(413, 'PAYLOAD_TOO_LARGE', `Files must be ${env.MAX_UPLOAD_MB} MB or smaller.`));
    }
    if (code === 'LIMIT_UNEXPECTED_FILE' || code === 'LIMIT_FILE_COUNT') {
      return next(validationError('Upload exactly one file in the “file” field.'));
    }
    return next(error);
  });
};

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = validatedQuery<{ page: number; pageSize: number }>(req);
  const { items, total } = await service.listImportJobs(query);
  sendSuccess(res, { imports: items }, { meta: paginationMeta(query.page, query.pageSize, total) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const file = req.file;
  if (!file) {
    throw validationError('Attach a CSV or XLSX file in the “file” field.', [{ path: 'file', message: 'No file received.' }]);
  }
  const result = await service.createImportJob(req.user, {
    buffer: file.buffer,
    originalname: file.originalname,
  });
  sendSuccess(res, result, {
    status: 201,
    message: `Parsed ${result.rowCount} row${result.rowCount === 1 ? '' : 's'}. Map the columns next.`,
  });
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const { jobId } = validatedParams<{ jobId: string }>(req);
  const query = validatedQuery<{ status?: string; page: number; pageSize: number }>(req);
  const result = await service.getImportJob(jobId, query);
  sendSuccess(res, result, { meta: paginationMeta(query.page, query.pageSize, result.total) });
});

export const preview = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { jobId } = validatedParams<{ jobId: string }>(req);
  const input = validatedBody<PreviewInput>(req);
  const result = await service.previewImport(req.user, jobId, input);
  sendSuccess(res, result, { message: `${result.summary.valid} row(s) ready to import.` });
});

export const commit = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { jobId } = validatedParams<{ jobId: string }>(req);
  const input = validatedBody<PreviewInput>(req);
  const result = await service.commitImport(req.user, jobId, input);
  sendSuccess(res, result, {
    message: result.alreadyCommitted
      ? 'This import was already committed.'
      : `Imported ${result.summary.imported ?? 0} task(s).`,
  });
});

export { singleFile };
