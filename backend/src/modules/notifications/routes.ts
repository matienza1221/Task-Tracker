import { Router } from 'express';
import { asyncHandler, notFound, unauthenticated } from '../../lib/errors';
import { paginationMeta, sendSuccess } from '../../lib/response';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { validatedBody, validatedParams, validatedQuery } from '../../middleware/validate';
import { z } from 'zod';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from './service';

const listQuerySchema = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const notificationParamSchema = z.object({ notificationId: z.string().uuid('Invalid notification id.') });

const readBodySchema = z.object({ read: z.boolean().default(true) }).strict();

/** Mounted at /api/notifications — a user's own notifications only. */
const router = Router();
router.use(requireAuth);

router.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthenticated();
    const query = validatedQuery<{ unreadOnly?: boolean; page: number; pageSize: number }>(req);
    const { items, total, unreadCount } = await listNotifications(req.user.id, query);
    sendSuccess(res, { notifications: items }, { meta: { ...paginationMeta(query.page, query.pageSize, total), unreadCount } });
  }),
);

router.patch(
  '/:notificationId/read',
  validate({ params: notificationParamSchema, body: readBodySchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthenticated();
    const { notificationId } = validatedParams<{ notificationId: string }>(req);
    const { read } = validatedBody<{ read: boolean }>(req);
    const updated = await markNotificationRead(req.user.id, notificationId, read);
    if (!updated) throw notFound('Notification not found.');
    sendSuccess(res, null, { message: read ? 'Marked as read.' : 'Marked as unread.' });
  }),
);

router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthenticated();
    const updated = await markAllNotificationsRead(req.user.id);
    sendSuccess(res, { updated }, { message: `${updated} notification${updated === 1 ? '' : 's'} marked as read.` });
  }),
);

export default router;
