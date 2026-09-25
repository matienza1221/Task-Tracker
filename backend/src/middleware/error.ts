import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { sendError } from '../lib/response';
import { logger } from '../lib/logger';
import { env } from '../config/env';

interface ZodIssueLike {
  path: (string | number)[];
  message: string;
  code: string;
}

export function formatZodIssues(error: ZodError): { path: string; message: string; code: string }[] {
  return (error.issues as ZodIssueLike[]).map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
    code: issue.code,
  }));
}

export const notFoundHandler: RequestHandler = (_req: Request, res: Response) => {
  sendError(res, 404, 'NOT_FOUND', 'Resource not found.');
};

/**
 * Central error handler. Never leaks stack traces or database internals in
 * production; every response uses the stable error envelope.
 */
export function errorHandler(error: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    if (!error.expose) {
      req.log?.error({ err: error }, 'Application error');
    }
    sendError(res, error.statusCode, error.code, error.message, error.details);
    return;
  }

  if (error instanceof ZodError) {
    sendError(res, 422, 'VALIDATION_ERROR', 'Validation failed.', formatZodIssues(error));
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      sendError(res, 409, 'CONFLICT', 'A record with these values already exists.');
      return;
    }
    if (error.code === 'P2003') {
      sendError(res, 409, 'CONFLICT', 'This operation conflicts with a related record.');
      return;
    }
    if (error.code === 'P2025') {
      sendError(res, 404, 'NOT_FOUND', 'Resource not found.');
      return;
    }
    req.log?.error({ err: error, prismaCode: error.code }, 'Unhandled Prisma error');
    sendError(res, 400, 'VALIDATION_ERROR', 'The request could not be processed.');
    return;
  }

  // body-parser: malformed JSON / payload too large
  const maybeBodyError = error as { type?: string; status?: number; message?: string };
  if (maybeBodyError?.type === 'entity.too.large' || maybeBodyError?.status === 413) {
    sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request payload is too large.');
    return;
  }
  if (error instanceof SyntaxError && 'body' in (error as object)) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Malformed JSON body.');
    return;
  }

  req.log?.error({ err: error }, 'Unhandled error');
  logger.error({ err: error, url: req.originalUrl }, 'Unhandled error');
  sendError(
    res,
    500,
    'INTERNAL_ERROR',
    env.isProduction ? 'An unexpected error occurred.' : error instanceof Error ? error.message : String(error),
  );
}
