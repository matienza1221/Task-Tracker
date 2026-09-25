import type { Request, Response } from 'express';
import { asyncHandler, unauthenticated } from '../../lib/errors';
import { sendSuccess } from '../../lib/response';
import { validatedParams } from '../../middleware/validate';
import { getTimeline } from './service';

export const timeline = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId } = validatedParams<{ projectId: string }>(req);
  sendSuccess(res, await getTimeline(req.user, projectId));
});
