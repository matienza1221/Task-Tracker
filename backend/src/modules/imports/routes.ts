import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import { commitSchema, importIdParamSchema, importRowsQuerySchema, listImportsQuerySchema, previewSchema } from './schemas';

/** Mounted at /api/admin/imports — administrators with `import:run` only. */
const router = Router();
router.use(requireAuth, requirePermission('import:run'));

router.get('/', validate({ query: listImportsQuerySchema }), controller.list);
router.post('/', controller.singleFile, controller.create);
router.get('/:jobId', validate({ params: importIdParamSchema, query: importRowsQuerySchema }), controller.get);
router.post('/:jobId/preview', validate({ params: importIdParamSchema, body: previewSchema }), controller.preview);
router.post('/:jobId/commit', validate({ params: importIdParamSchema, body: commitSchema }), controller.commit);

export default router;
