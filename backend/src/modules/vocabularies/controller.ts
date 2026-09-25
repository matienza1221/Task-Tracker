import type { Request, Response } from 'express';
import { asyncHandler, unauthenticated } from '../../lib/errors';
import { sendSuccess } from '../../lib/response';
import { validatedBody, validatedParams, validatedQuery } from '../../middleware/validate';
import * as service from './service';
import type { CreateVocabularyInput, UpdateVocabularyInput, VocabularyKind } from './schemas';

export const list = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await service.listVocabularies());
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { kind } = validatedParams<{ kind: VocabularyKind }>(req);
  const input = validatedBody<CreateVocabularyInput>(req);
  const item = await service.createVocabularyItem(kind, input, req.user);
  sendSuccess(res, { item }, { status: 201, message: 'Entry created.' });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { kind, id } = validatedParams<{ kind: VocabularyKind; id: string }>(req);
  const input = validatedBody<UpdateVocabularyInput>(req);
  const item = await service.updateVocabularyItem(kind, id, input, req.user);
  sendSuccess(res, { item }, { message: 'Entry updated.' });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { kind, id } = validatedParams<{ kind: VocabularyKind; id: string }>(req);
  const { hard } = validatedQuery<{ hard: boolean }>(req);
  await service.deleteVocabularyItem(kind, id, { hard }, req.user);
  sendSuccess(res, null, { message: hard ? 'Entry deleted.' : 'Entry deactivated.' });
});
