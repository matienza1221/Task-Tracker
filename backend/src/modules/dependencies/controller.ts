import type { Request, Response } from 'express';
import { asyncHandler, unauthenticated } from '../../lib/errors';
import { sendSuccess } from '../../lib/response';
import { validatedBody, validatedParams } from '../../middleware/validate';
import * as service from './service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { taskId } = validatedParams<{ taskId: string }>(req);
  sendSuccess(res, await service.listDependencies(req.user, taskId));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { taskId } = validatedParams<{ taskId: string }>(req);
  const { dependsOnTaskId } = validatedBody<{ dependsOnTaskId: string }>(req);
  const result = await service.addDependency(req.user, taskId, dependsOnTaskId);
  sendSuccess(res, result, { status: 201, message: 'Dependency added.' });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { taskId, dependsOnTaskId } = validatedParams<{ taskId: string; dependsOnTaskId: string }>(req);
  const result = await service.removeDependency(req.user, taskId, dependsOnTaskId);
  sendSuccess(res, result, { message: 'Dependency removed.' });
});
