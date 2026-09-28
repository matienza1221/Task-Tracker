import type { Request, Response } from 'express';
import { asyncHandler, unauthenticated } from '../../lib/errors';
import { sendSuccess } from '../../lib/response';
import { validatedBody, validatedParams } from '../../middleware/validate';
import * as memberService from './memberService';
import type { ProjectRole } from '@prisma/client';

type MemberParams = { projectId: string; userId: string };

export const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId } = validatedParams<{ projectId: string }>(req);
  sendSuccess(res, { members: await memberService.listMembers(req.user, projectId) });
});

export const progress = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId } = validatedParams<{ projectId: string }>(req);
  sendSuccess(res, { members: await memberService.listMemberProgress(req.user, projectId) });
});

export const add = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId } = validatedParams<{ projectId: string }>(req);
  const input = validatedBody<{ userId: string; projectRole: ProjectRole }>(req);
  const member = await memberService.addMember(req.user, projectId, input);
  sendSuccess(res, { member }, { status: 201, message: 'Member added to the project.' });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId, userId } = validatedParams<MemberParams>(req);
  const { projectRole } = validatedBody<{ projectRole: ProjectRole }>(req);
  const member = await memberService.updateMemberRole(req.user, projectId, userId, projectRole);
  sendSuccess(res, { member }, { message: 'Member role updated.' });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId, userId } = validatedParams<MemberParams>(req);
  await memberService.removeMember(req.user, projectId, userId);
  sendSuccess(res, null, { message: 'Member removed from the project.' });
});
