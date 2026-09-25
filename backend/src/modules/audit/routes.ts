import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, unauthenticated } from '../../lib/errors';
import { paginationMeta, sendSuccess } from '../../lib/response';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validate, validatedQuery } from '../../middleware/validate';
import { dateOnly } from '../../lib/validation';
import { AUDIT_ACTIONS } from './constants';
import { auditLogActions, exportAuditLogsCsv, listAuditLogs, type AuditLogFilters } from './queries';

const auditQuerySchema = z.object({
  action: z.enum(AUDIT_ACTIONS).optional(),
  actorEmail: z.string().trim().max(254).optional(),
  resourceType: z.string().trim().max(60).optional(),
  resourceId: z.string().trim().max(80).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  format: z.enum(['json', 'csv']).default('json'),
});

/** Mounted at /api/admin/audit-logs — administrators with `audit:view` only. */
const router = Router();
router.use(requireAuth, requirePermission('audit:view'));

router.get(
  '/actions',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, { actions: await auditLogActions() });
  }),
);

router.get(
  '/',
  validate({ query: auditQuerySchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthenticated();
    const query = validatedQuery<AuditLogFilters & { format: 'json' | 'csv' }>(req);

    if (query.format === 'csv') {
      const csv = await exportAuditLogsCsv(query);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(csv);
      return;
    }

    const { items, total } = await listAuditLogs(query);
    sendSuccess(res, { auditLogs: items }, { meta: paginationMeta(query.page, query.pageSize, total) });
  }),
);

export default router;
