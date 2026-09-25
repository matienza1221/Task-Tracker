import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { taskCommentsRouter } from '../comments/routes';
import dependencyRoutes from '../dependencies/routes';
import { taskAttachmentsRouter } from '../attachments/routes';
import { validate } from '../../middleware/validate';
import * as controller from './taskController';
import { projectIdParamSchema } from '../projects/schemas';
import {
  bulkTaskSchema,
  createSubtaskSchema,
  createTaskSchema,
  moveTaskSchema,
  taskActivityQuerySchema,
  taskIdParamSchema,
  taskListQuerySchema,
  updateTaskAssigneeSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
} from './schemas';

/** Mounted at /api/projects/:projectId/tasks */
export const projectTasksRouter = Router({ mergeParams: true });
projectTasksRouter.use(requireAuth);
projectTasksRouter.get(
  '/',
  validate({ params: projectIdParamSchema, query: taskListQuerySchema }),
  controller.listByProject,
);
projectTasksRouter.post(
  '/',
  validate({ params: projectIdParamSchema, body: createTaskSchema }),
  controller.create,
);
// Nested collaboration resources live under /api/tasks/:taskId/* (see below).

/** Mounted at /api/tasks */
export const tasksRouter = Router();
tasksRouter.use(requireAuth);
// Declared before /:taskId so "bulk" is never parsed as an id.
tasksRouter.post('/bulk', validate({ body: bulkTaskSchema }), controller.bulk);
tasksRouter.get('/:taskId', validate({ params: taskIdParamSchema }), controller.get);
tasksRouter.patch('/:taskId', validate({ params: taskIdParamSchema, body: updateTaskSchema }), controller.update);
tasksRouter.patch(
  '/:taskId/status',
  validate({ params: taskIdParamSchema, body: updateTaskStatusSchema }),
  controller.updateStatus,
);
tasksRouter.patch(
  '/:taskId/assignee',
  validate({ params: taskIdParamSchema, body: updateTaskAssigneeSchema }),
  controller.updateAssignee,
);
tasksRouter.post(
  '/:taskId/move',
  validate({ params: taskIdParamSchema, body: moveTaskSchema }),
  controller.move,
);
tasksRouter.post(
  '/:taskId/subtasks',
  validate({ params: taskIdParamSchema, body: createSubtaskSchema }),
  controller.createSubtask,
);
tasksRouter.get(
  '/:taskId/activity',
  validate({ params: taskIdParamSchema, query: taskActivityQuerySchema }),
  controller.activity,
);
tasksRouter.delete('/:taskId', validate({ params: taskIdParamSchema }), controller.remove);

tasksRouter.use('/:taskId/dependencies', dependencyRoutes);
tasksRouter.use('/:taskId/comments', taskCommentsRouter);
tasksRouter.use('/:taskId/attachments', taskAttachmentsRouter);

/** Mounted at /api/my */
export const myTasksRouter = Router();
myTasksRouter.use(requireAuth);
myTasksRouter.get('/tasks', validate({ query: taskListQuerySchema }), controller.listMine);
