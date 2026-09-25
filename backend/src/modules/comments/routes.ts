import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import { commentIdParamSchema, createCommentSchema, listCommentsQuerySchema, updateCommentSchema } from './schemas';
import { taskIdParamSchema } from '../attachments/schemas';

/** Mounted at /api/tasks/:taskId/comments */
export const taskCommentsRouter = Router({ mergeParams: true });
taskCommentsRouter.use(requireAuth);
taskCommentsRouter.get('/', validate({ params: taskIdParamSchema, query: listCommentsQuerySchema }), controller.list);
taskCommentsRouter.post('/', validate({ params: taskIdParamSchema, body: createCommentSchema }), controller.create);

/** Mounted at /api/comments */
export const commentsRouter = Router();
commentsRouter.use(requireAuth);
commentsRouter.patch('/:commentId', validate({ params: commentIdParamSchema, body: updateCommentSchema }), controller.update);
commentsRouter.delete('/:commentId', validate({ params: commentIdParamSchema }), controller.remove);
