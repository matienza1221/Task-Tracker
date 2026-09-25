import { Router } from 'express';
import { asyncHandler } from '../lib/errors';
import { sendSuccess } from '../lib/response';
import { prisma } from '../db/prisma';
import authRoutes from '../modules/auth/routes';
import { attachmentsRouter } from '../modules/attachments/routes';
import { commentsRouter } from '../modules/comments/routes';
import analyticsRoutes from '../modules/analytics/routes';
import auditRoutes from '../modules/audit/routes';
import calendarRoutes from '../modules/calendar/routes';
import dashboardRoutes from '../modules/dashboard/routes';
import importRoutes from '../modules/imports/routes';
import notificationRoutes from '../modules/notifications/routes';
import metaRoutes from '../modules/meta/routes';
import projectRoutes from '../modules/projects/projectRoutes';
import searchRoutes from '../modules/search/routes';
import { myTasksRouter, tasksRouter } from '../modules/tasks/taskRoutes';
import userRoutes from '../modules/users/routes';
import vocabularyRoutes from '../modules/vocabularies/routes';
import workloadRoutes from '../modules/workload/routes';

const router = Router();

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    let database: 'up' | 'down' = 'up';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    sendSuccess(
      res,
      {
        status: database === 'up' ? 'ok' : 'degraded',
        database,
        uptimeSeconds: Math.round(process.uptime()),
        version: process.env.npm_package_version ?? '0.1.0',
      },
      { status: database === 'up' ? 200 : 503 },
    );
  }),
);

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/team', workloadRoutes);
router.use('/users', userRoutes);
// Analytics lives under /projects/:projectId/analytics; mounted before the
// project router so the nested path resolves first.
router.use('/projects', analyticsRoutes);
router.use('/projects', projectRoutes);
router.use('/tasks', tasksRouter);
router.use('/my', myTasksRouter);
router.use('/meta', metaRoutes);
router.use('/search', searchRoutes);
router.use('/calendar', calendarRoutes);
router.use('/comments', commentsRouter);
router.use('/attachments', attachmentsRouter);
router.use('/notifications', notificationRoutes);
router.use('/admin/vocabularies', vocabularyRoutes);
router.use('/admin/audit-logs', auditRoutes);
router.use('/admin/imports', importRoutes);

export default router;
