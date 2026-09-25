import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './labelController';
import { createLabelSchema, labelParamSchema, projectIdParamSchema, updateLabelSchema } from './schemas';

/** Mounted at /api/projects/:projectId/labels */
const router = Router({ mergeParams: true });

router.use(requireAuth);

router.get('/', validate({ params: projectIdParamSchema }), controller.list);
router.post('/', validate({ params: projectIdParamSchema, body: createLabelSchema }), controller.create);
router.patch('/:labelId', validate({ params: labelParamSchema, body: updateLabelSchema }), controller.update);
router.delete('/:labelId', validate({ params: labelParamSchema }), controller.remove);

export default router;
