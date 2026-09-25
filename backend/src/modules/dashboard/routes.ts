import { Router } from 'express';
import { asyncHandler, unauthenticated } from '../../lib/errors';
import { sendSuccess } from '../../lib/response';
import { requireAuth } from '../../middleware/auth';
import { getDashboardSummary } from './service';

const router = Router();
router.use(requireAuth);

/** Personal dashboard: project/task statistics, my work and upcoming milestones. */
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthenticated();
    sendSuccess(res, await getDashboardSummary(req.user));
  }),
);

export default router;
