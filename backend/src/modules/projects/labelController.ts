import type { Request, Response } from 'express';
import { asyncHandler, unauthenticated } from '../../lib/errors';
import { sendSuccess } from '../../lib/response';
import { validatedBody, validatedParams } from '../../middleware/validate';
import * as labelService from './labelService';
import type { CreateLabelInput, UpdateLabelInput } from './schemas';

type LabelParams = { projectId: string; labelId: string };

export const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId } = validatedParams<{ projectId: string }>(req);
  sendSuccess(res, { labels: await labelService.listLabels(req.user, projectId) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId } = validatedParams<{ projectId: string }>(req);
  const input = validatedBody<CreateLabelInput>(req);
  const label = await labelService.createLabel(req.user, projectId, input);
  sendSuccess(res, { label }, { status: 201, message: 'Label created.' });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId, labelId } = validatedParams<LabelParams>(req);
  const input = validatedBody<UpdateLabelInput>(req);
  const label = await labelService.updateLabel(req.user, projectId, labelId, input);
  sendSuccess(res, { label }, { message: 'Label updated.' });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId, labelId } = validatedParams<LabelParams>(req);
  await labelService.deleteLabel(req.user, projectId, labelId);
  sendSuccess(res, null, { message: 'Label deleted.' });
});
