import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './milestoneController';
import { createMilestoneSchema, milestoneParamSchema, projectIdParamSchema, updateMilestoneSchema } from './schemas';

/** Mounted at /api/projects/:projectId/milestones */
const router = Router({ mergeParams: true });

router.use(requireAuth);

router.get('/', validate({ params: projectIdParamSchema }), controller.list);
router.post('/', validate({ params: projectIdParamSchema, body: createMilestoneSchema }), controller.create);
router.patch(
  '/:milestoneId',
  validate({ params: milestoneParamSchema, body: updateMilestoneSchema }),
  controller.update,
);
router.delete('/:milestoneId', validate({ params: milestoneParamSchema }), controller.remove);

export default router;
