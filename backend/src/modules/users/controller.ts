import type { Request, Response } from 'express';
import { asyncHandler, unauthenticated } from '../../lib/errors';
import { paginationMeta, sendSuccess } from '../../lib/response';
import { validatedBody, validatedParams, validatedQuery } from '../../middleware/validate';
import * as service from './service';
import type {
  CreateUserInput,
  ListUsersQuery,
  LookupUsersQuery,
  UpdateUserInput,
} from './schemas';

type UserIdParams = { userId: string };

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = validatedQuery<ListUsersQuery>(req);
  const { items, total } = await service.listUsers(query);
  sendSuccess(res, { users: items }, { meta: paginationMeta(query.page, query.pageSize, total) });
});

export const lookup = asyncHandler(async (req: Request, res: Response) => {
  const query = validatedQuery<LookupUsersQuery>(req);
  sendSuccess(res, { users: await service.lookupUsers(query) });
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = validatedParams<UserIdParams>(req);
  sendSuccess(res, { user: await service.getUser(userId) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const input = validatedBody<CreateUserInput>(req);
  const { user, temporaryPassword } = await service.createUser(req.user, input);
  sendSuccess(
    res,
    { user, temporaryPassword },
    {
      status: 201,
      message: temporaryPassword
        ? 'User created. Share the temporary password securely; it must be changed at first sign-in.'
        : 'User created. The user must change the password at first sign-in.',
    },
  );
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { userId } = validatedParams<UserIdParams>(req);
  const input = validatedBody<UpdateUserInput>(req);
  sendSuccess(res, { user: await service.updateUser(req.user, userId, input) }, { message: 'User updated successfully.' });
});

export const changeRole = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { userId } = validatedParams<UserIdParams>(req);
  const { globalRole } = validatedBody<{ globalRole: Parameters<typeof service.changeUserRole>[2] }>(req);
  sendSuccess(res, { user: await service.changeUserRole(req.user, userId, globalRole) }, { message: 'Role updated successfully.' });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { userId } = validatedParams<UserIdParams>(req);
  const { purge } = validatedQuery<{ purge: boolean }>(req);
  await service.deleteUser(req.user, userId, { purge });
  sendSuccess(res, null, { message: purge ? 'User permanently deleted.' : 'User deactivated and archived.' });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { userId } = validatedParams<UserIdParams>(req);
  const result = await service.resetUserPassword(req.user, userId);
  sendSuccess(res, result, {
    message: 'Temporary password generated. It is shown only once and must be changed at next sign-in.',
  });
});
