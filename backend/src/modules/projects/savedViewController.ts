import type { Request, Response } from 'express';
import { asyncHandler, unauthenticated } from '../../lib/errors';
import { sendSuccess } from '../../lib/response';
import { validatedBody, validatedParams } from '../../middleware/validate';
import * as savedViewService from './savedViewService';
import type { CreateSavedViewInput, UpdateSavedViewInput } from './schemas';

type SavedViewParams = { projectId: string; viewId: string };

export const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId } = validatedParams<{ projectId: string }>(req);
  sendSuccess(res, { savedViews: await savedViewService.listSavedViews(req.user, projectId) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId } = validatedParams<{ projectId: string }>(req);
  const input = validatedBody<CreateSavedViewInput>(req);
  const savedView = await savedViewService.createSavedView(req.user, projectId, input);
  sendSuccess(res, { savedView }, { status: 201, message: 'View saved.' });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId, viewId } = validatedParams<SavedViewParams>(req);
  const input = validatedBody<UpdateSavedViewInput>(req);
  const savedView = await savedViewService.updateSavedView(req.user, projectId, viewId, input);
  sendSuccess(res, { savedView }, { message: 'View updated.' });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId, viewId } = validatedParams<SavedViewParams>(req);
  await savedViewService.deleteSavedView(req.user, projectId, viewId);
  sendSuccess(res, null, { message: 'View deleted.' });
});
