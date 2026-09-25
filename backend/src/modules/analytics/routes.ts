import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, unauthenticated } from '../../lib/errors';
import { sendSuccess } from '../../lib/response';
import { requireAuth } from '../../middleware/auth';
import { validate, validatedParams, validatedQuery } from '../../middleware/validate';
import { projectIdParamSchema } from '../projects/schemas';
import { analyticsQuerySchema, type AnalyticsQuery } from './schemas';
import { getProjectAnalytics } from './service';

const router = Router();
router.use(requireAuth);

/** Project analytics for the reports page. */
router.get(
  '/:projectId/analytics',
  validate({ params: projectIdParamSchema, query: analyticsQuerySchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthenticated();
    const { projectId } = validatedParams<{ projectId: string }>(req);
    const { days } = validatedQuery<AnalyticsQuery>(req);
    sendSuccess(res, await getProjectAnalytics(req.user, projectId, days));
  }),
);

export default router;
