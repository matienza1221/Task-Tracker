import { Router } from 'express';
import { requireAnyPermission, requireAuth, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import {
  changeRoleSchema,
  createUserSchema,
  deleteUserQuerySchema,
  listUsersQuerySchema,
  lookupUsersQuerySchema,
  updateUserSchema,
  userIdParamSchema,
} from './schemas';

const router = Router();

router.use(requireAuth);

/**
 * Directory lookup for project member pickers: project managers hold
 * `project:manage_members` but not `user:manage`, so this endpoint is gated on
 * either permission and returns only minimal, non-sensitive fields.
 * Declared before `/:userId` so "lookup" is never parsed as an id.
 */
router.get(
  '/lookup',
  requireAnyPermission('project:manage_members', 'user:manage'),
  validate({ query: lookupUsersQuerySchema }),
  controller.lookup,
);

router.get('/', requirePermission('user:manage'), validate({ query: listUsersQuerySchema }), controller.list);
router.post('/', requirePermission('user:manage'), validate({ body: createUserSchema }), controller.create);

router.get('/:userId', requirePermission('user:manage'), validate({ params: userIdParamSchema }), controller.get);
router.patch(
  '/:userId',
  requirePermission('user:manage'),
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  controller.update,
);
router.patch(
  '/:userId/role',
  requirePermission('role:manage'),
  validate({ params: userIdParamSchema, body: changeRoleSchema }),
  controller.changeRole,
);
router.post(
  '/:userId/reset-password',
  requirePermission('user:manage'),
  validate({ params: userIdParamSchema }),
  controller.resetPassword,
);
router.delete(
  '/:userId',
  requirePermission('user:manage'),
  validate({ params: userIdParamSchema, query: deleteUserQuerySchema }),
  controller.remove,
);

export default router;
