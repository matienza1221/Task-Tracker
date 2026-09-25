import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import multer from 'multer';
import { env } from '../../config/env';
import { AppError, validationError } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import { attachmentIdParamSchema, listAttachmentsQuerySchema, taskIdParamSchema } from './schemas';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 5 },
});

/** Maps multer's limit errors onto the standard error envelope. */
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

/** Mounted at /api/tasks/:taskId/attachments */
export const taskAttachmentsRouter = Router({ mergeParams: true });
taskAttachmentsRouter.use(requireAuth);
taskAttachmentsRouter.get('/', validate({ params: taskIdParamSchema, query: listAttachmentsQuerySchema }), controller.listTaskAttachments);
taskAttachmentsRouter.post('/', validate({ params: taskIdParamSchema }), singleFile, controller.upload);

/** Mounted at /api/attachments */
export const attachmentsRouter = Router();
attachmentsRouter.use(requireAuth);
attachmentsRouter.get('/:attachmentId/download', validate({ params: attachmentIdParamSchema }), controller.download);
attachmentsRouter.delete('/:attachmentId', validate({ params: attachmentIdParamSchema }), controller.remove);
