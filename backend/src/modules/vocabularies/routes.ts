import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import {
  VOCABULARY_KINDS,
  createVocabularySchema,
  updateVocabularySchema,
  vocabularyParamSchema,
  vocabularyQuerySchema,
} from './schemas';
import { z } from 'zod';

const kindParamSchema = z.object({ kind: z.enum(VOCABULARY_KINDS) });

/** Mounted at /api/admin/vocabularies — administrators only. */
const router = Router();

router.use(requireAuth, requirePermission('vocabulary:manage'));

router.get('/', controller.list);
router.post('/:kind', validate({ params: kindParamSchema, body: createVocabularySchema }), controller.create);
router.patch('/:kind/:id', validate({ params: vocabularyParamSchema, body: updateVocabularySchema }), controller.update);
router.delete(
  '/:kind/:id',
  validate({ params: vocabularyParamSchema, query: vocabularyQuerySchema }),
  controller.remove,
);

export default router;
