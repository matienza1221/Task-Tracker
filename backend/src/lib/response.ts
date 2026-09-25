import type { Response } from 'express';

export interface ResponseMeta {
  requestId?: string;
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  message?: string;
  meta?: ResponseMeta;
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: ResponseMeta;
}

export function paginationMeta(page: number, pageSize: number, total: number): ResponseMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  options: { status?: number; message?: string; meta?: ResponseMeta } = {},
): Response<SuccessEnvelope<T>> {
  const body: SuccessEnvelope<T> = { success: true, data };
  if (options.message) body.message = options.message;
  const meta = { requestId: res.locals.requestId as string | undefined, ...options.meta };
  if (Object.values(meta).some((value) => value !== undefined)) body.meta = meta;
  return res.status(options.status ?? 200).json(body);
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response<ErrorEnvelope> {
  const body: ErrorEnvelope = { success: false, error: { code, message } };
  if (details !== undefined) body.error.details = details;
  const requestId = res.locals.requestId as string | undefined;
  if (requestId) body.meta = { requestId };
  return res.status(status).json(body);
}
