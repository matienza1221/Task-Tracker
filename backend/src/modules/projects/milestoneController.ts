import type { Request, Response } from 'express';
import { asyncHandler, unauthenticated } from '../../lib/errors';
import { sendSuccess } from '../../lib/response';
import { validatedBody, validatedParams } from '../../middleware/validate';
import * as milestoneService from './milestoneService';
import type { CreateMilestoneInput, UpdateMilestoneInput } from './schemas';

type MilestoneParams = { projectId: string; milestoneId: string };

export const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId } = validatedParams<{ projectId: string }>(req);
  sendSuccess(res, { milestones: await milestoneService.listMilestones(req.user, projectId) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId } = validatedParams<{ projectId: string }>(req);
  const input = validatedBody<CreateMilestoneInput>(req);
  const milestone = await milestoneService.createMilestone(req.user, projectId, input);
  sendSuccess(res, { milestone }, { status: 201, message: 'Milestone created.' });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId, milestoneId } = validatedParams<MilestoneParams>(req);
  const input = validatedBody<UpdateMilestoneInput>(req);
  const milestone = await milestoneService.updateMilestone(req.user, projectId, milestoneId, input);
  sendSuccess(res, { milestone }, { message: 'Milestone updated.' });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId, milestoneId } = validatedParams<MilestoneParams>(req);
  await milestoneService.deleteMilestone(req.user, projectId, milestoneId);
  sendSuccess(res, null, { message: 'Milestone deleted.' });
});
