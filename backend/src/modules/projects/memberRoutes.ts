import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './memberController';
import { addMemberSchema, memberParamSchema, updateMemberSchema } from './schemas';

/** Mounted at /api/projects/:projectId/members */
const router = Router({ mergeParams: true });

router.use(requireAuth);

router.get('/', validate({ params: memberParamSchema.pick({ projectId: true }) }), controller.list);
// Declared before `/:userId` so "progress" is never parsed as a user id.
router.get('/progress', validate({ params: memberParamSchema.pick({ projectId: true }) }), controller.progress);
router.post('/', validate({ params: memberParamSchema.pick({ projectId: true }), body: addMemberSchema }), controller.add);
router.patch(
  '/:userId',
  validate({ params: memberParamSchema, body: updateMemberSchema }),
  controller.update,
);
router.delete('/:userId', validate({ params: memberParamSchema }), controller.remove);

export default router;
