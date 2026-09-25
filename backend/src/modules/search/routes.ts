import { Router } from 'express';
import { asyncHandler, unauthenticated } from '../../lib/errors';
import { sendSuccess } from '../../lib/response';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { validatedQuery } from '../../middleware/validate';
import { searchAll } from './service';
import { searchQuerySchema, type SearchQuery } from './schemas';

const router = Router();

router.use(requireAuth);

/** Command-palette search across accessible tasks and projects. */
router.get(
  '/',
  validate({ query: searchQuerySchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthenticated();
    const { q, limit } = validatedQuery<SearchQuery>(req);
    sendSuccess(res, await searchAll(req.user, q, limit));
  }),
);

export default router;
