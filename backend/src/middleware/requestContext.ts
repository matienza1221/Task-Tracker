import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { logger } from '../lib/logger';

const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const header = req.headers['x-request-id'];
    const id = typeof header === 'string' && header.length > 0 && header.length <= 128 ? header : randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  autoLogging: !env.isTest,
  customLogLevel: (_req, res, error) => {
    if (error || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode} failed`,
});

/** Request id + structured logging. Must be the first middleware. */
export const requestContext: RequestHandler[] = [
  httpLogger,
  (req, res, next) => {
    res.locals.requestId = req.id;
    next();
  },
];
