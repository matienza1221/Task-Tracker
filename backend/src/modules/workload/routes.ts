import { Router } from 'express';
import { asyncHandler, unauthenticated } from '../../lib/errors';
import { sendSuccess } from '../../lib/response';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validate, validatedQuery } from '../../middleware/validate';
import { getWorkload, workloadQuerySchema } from './service';

const router = Router();
router.use(requireAuth, requirePermission('workload:view'));

/** Team workload, optionally narrowed to one project. */
router.get(
  '/workload',
  validate({ query: workloadQuerySchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthenticated();
    const query = validatedQuery<{ projectId?: string; includeCompleted?: boolean }>(req);
    sendSuccess(res, await getWorkload(req.user, query));
  }),
);

export default router;
