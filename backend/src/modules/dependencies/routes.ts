import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import { createDependencySchema, dependencyParamSchema } from './schemas';

/** Mounted at /api/tasks/:taskId/dependencies */
const router = Router({ mergeParams: true });
router.use(requireAuth);

router.get('/', validate({ params: dependencyParamSchema.pick({ taskId: true }) }), controller.list);
router.post(
  '/',
  validate({ params: dependencyParamSchema.pick({ taskId: true }), body: createDependencySchema }),
  controller.create,
);
router.delete('/:dependsOnTaskId', validate({ params: dependencyParamSchema }), controller.remove);

export default router;
