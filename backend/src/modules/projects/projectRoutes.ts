import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './projectController';
import labelRoutes from './labelRoutes';
import memberRoutes from './memberRoutes';
import milestoneRoutes from './milestoneRoutes';
import savedViewRoutes from './savedViewRoutes';
import { projectTasksRouter } from '../tasks/taskRoutes';
import * as taskController from '../tasks/taskController';
import * as timelineController from '../timeline/controller';
import { exportProjectCsv } from '../exports/service';
import { asyncHandler, unauthenticated } from '../../lib/errors';
import { boardQuerySchema } from '../tasks/schemas';
import {
  createProjectSchema,
  deleteProjectQuerySchema,
  listActivityQuerySchema,
  listProjectsQuerySchema,
  projectIdParamSchema,
  updateProjectSchema,
} from './schemas';

const router = Router();

router.use(requireAuth);

router.get('/', validate({ query: listProjectsQuerySchema }), controller.list);
router.post('/', requirePermission('project:create'), validate({ body: createProjectSchema }), controller.create);

router.get('/:projectId', validate({ params: projectIdParamSchema }), controller.get);
router.patch('/:projectId', validate({ params: projectIdParamSchema, body: updateProjectSchema }), controller.update);
router.delete(
  '/:projectId',
  validate({ params: projectIdParamSchema, query: deleteProjectQuerySchema }),
  controller.remove,
);
router.post('/:projectId/archive', validate({ params: projectIdParamSchema }), controller.archive);
router.post('/:projectId/unarchive', validate({ params: projectIdParamSchema }), controller.unarchive);
router.get(
  '/:projectId/export.csv',
  validate({ params: projectIdParamSchema }),
  asyncHandler(async (req, res) => {
    if (!req.user) throw unauthenticated();
    const { projectId } = req.params as { projectId: string };
    const csv = await exportProjectCsv(req.user, projectId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="project-${projectId.slice(0, 8)}-tasks.csv"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(csv);
  }),
);
router.get(
  '/:projectId/timeline',
  validate({ params: projectIdParamSchema }),
  timelineController.timeline,
);
router.get(
  '/:projectId/board',
  validate({ params: projectIdParamSchema, query: boardQuerySchema }),
  taskController.board,
);
router.get(
  '/:projectId/activity',
  validate({ params: projectIdParamSchema, query: listActivityQuerySchema }),
  controller.activity,
);

// Nested, project-scoped resources. Each nested router re-validates :projectId
// and every service resolves resource → project → permission (IDOR guard).
router.use('/:projectId/members', memberRoutes);
router.use('/:projectId/milestones', milestoneRoutes);
router.use('/:projectId/labels', labelRoutes);
router.use('/:projectId/saved-views', savedViewRoutes);
router.use('/:projectId/tasks', projectTasksRouter);

export default router;
