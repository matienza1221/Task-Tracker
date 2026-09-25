import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './savedViewController';
import { createSavedViewSchema, projectIdParamSchema, savedViewParamSchema, updateSavedViewSchema } from './schemas';

/** Mounted at /api/projects/:projectId/saved-views */
const router = Router({ mergeParams: true });

router.use(requireAuth);

router.get('/', validate({ params: projectIdParamSchema }), controller.list);
router.post('/', validate({ params: projectIdParamSchema, body: createSavedViewSchema }), controller.create);
router.patch('/:viewId', validate({ params: savedViewParamSchema, body: updateSavedViewSchema }), controller.update);
router.delete('/:viewId', validate({ params: savedViewParamSchema }), controller.remove);

export default router;
