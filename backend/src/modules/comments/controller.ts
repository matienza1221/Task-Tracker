import type { Request, Response } from 'express';
import { asyncHandler, unauthenticated } from '../../lib/errors';
import { paginationMeta, sendSuccess } from '../../lib/response';
import { validatedBody, validatedParams, validatedQuery } from '../../middleware/validate';
import * as service from './service';
import type { CreateCommentInput, UpdateCommentInput } from './schemas';

export const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { taskId } = validatedParams<{ taskId: string }>(req);
  const query = validatedQuery<{ page: number; pageSize: number }>(req);
  const { items, total } = await service.listComments(req.user, taskId, query);
  sendSuccess(res, { comments: items }, { meta: paginationMeta(query.page, query.pageSize, total) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { taskId } = validatedParams<{ taskId: string }>(req);
  const input = validatedBody<CreateCommentInput>(req);
  const comment = await service.createComment(req.user, taskId, input);
  sendSuccess(res, { comment }, { status: 201, message: 'Comment added.' });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { commentId } = validatedParams<{ commentId: string }>(req);
  const input = validatedBody<UpdateCommentInput>(req);
  const comment = await service.updateComment(req.user, commentId, input);
  sendSuccess(res, { comment }, { message: 'Comment updated.' });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { commentId } = validatedParams<{ commentId: string }>(req);
  await service.deleteComment(req.user, commentId);
  sendSuccess(res, null, { message: 'Comment deleted.' });
});
