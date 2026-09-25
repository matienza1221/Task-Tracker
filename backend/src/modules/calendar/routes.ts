import { Router } from 'express';
import { asyncHandler, unauthenticated } from '../../lib/errors';
import { sendSuccess } from '../../lib/response';
import { requireAuth } from '../../middleware/auth';
import { validate, validatedQuery } from '../../middleware/validate';
import { calendarQuerySchema, type CalendarQuery } from './schemas';
import { getCalendar } from './service';

const router = Router();
router.use(requireAuth);

/** Calendar data for the requested window, scoped to accessible projects. */
router.get(
  '/',
  validate({ query: calendarQuerySchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthenticated();
    const query = validatedQuery<CalendarQuery>(req);
    sendSuccess(res, await getCalendar(req.user, query));
  }),
);

export default router;
