import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny } from 'zod';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates and coerces request input with Zod. Parsed values are stored on
 * `req.validated` (never by mutating Express getters), and unknown keys are
 * stripped by the schemas themselves (`.strict()` where it matters).
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.validated = {
        params: schemas.params ? (schemas.params.parse(req.params) as Record<string, unknown>) : {},
        query: schemas.query ? (schemas.query.parse(req.query) as Record<string, unknown>) : {},
        body: schemas.body ? (schemas.body.parse(req.body ?? {}) as Record<string, unknown>) : {},
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validatedBody<T>(req: Request): T {
  return req.validated.body as T;
}

export function validatedQuery<T>(req: Request): T {
  return req.validated.query as T;
}

export function validatedParams<T>(req: Request): T {
  return req.validated.params as T;
}
