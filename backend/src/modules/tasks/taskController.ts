import type { Request, Response } from 'express';
import { asyncHandler, unauthenticated } from '../../lib/errors';
import { paginationMeta, sendSuccess } from '../../lib/response';
import { validatedBody, validatedParams, validatedQuery } from '../../middleware/validate';
import * as boardService from './boardService';
import * as taskService from './taskService';
import type { BoardQuery, BulkTaskInput, CreateTaskInput, TaskListQuery, UpdateTaskInput } from './schemas';

type TaskIdParams = { taskId: string };
type ProjectIdParams = { projectId: string };

export const listByProject = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId } = validatedParams<ProjectIdParams>(req);
  const query = validatedQuery<TaskListQuery>(req);
  const { items, total } = await taskService.listProjectTasks(req.user, projectId, query);
  sendSuccess(res, { tasks: items }, { meta: paginationMeta(query.page, query.pageSize, total) });
});

export const listMine = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const query = validatedQuery<TaskListQuery>(req);
  const { items, total } = await taskService.listMyTasks(req.user, query);
  sendSuccess(res, { tasks: items }, { meta: paginationMeta(query.page, query.pageSize, total) });
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { taskId } = validatedParams<TaskIdParams>(req);
  sendSuccess(res, { task: await taskService.getTask(req.user, taskId) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId } = validatedParams<ProjectIdParams>(req);
  const input = validatedBody<CreateTaskInput>(req);
  const task = await taskService.createTask(req.user, projectId, input);
  sendSuccess(res, { task }, { status: 201, message: `Task ${task.key} created.` });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { taskId } = validatedParams<TaskIdParams>(req);
  const input = validatedBody<UpdateTaskInput>(req);
  const task = await taskService.updateTask(req.user, taskId, input);
  sendSuccess(res, { task }, { message: `Task ${task.key} updated.` });
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { taskId } = validatedParams<TaskIdParams>(req);
  const { statusId, version } = validatedBody<{ statusId: string; version: number }>(req);
  const task = await taskService.changeTaskStatus(req.user, taskId, statusId, version);
  sendSuccess(res, { task }, { message: `Task ${task.key} moved to ${task.status.name}.` });
});

export const updateAssignee = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { taskId } = validatedParams<TaskIdParams>(req);
  const { assigneeId, version } = validatedBody<{ assigneeId: string | null; version: number }>(req);
  const task = await taskService.assignTask(req.user, taskId, assigneeId, version);
  sendSuccess(res, { task }, { message: assigneeId ? `Task assigned to ${task.assignee?.displayName}.` : 'Task unassigned.' });
});

export const createSubtask = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { taskId } = validatedParams<TaskIdParams>(req);
  const { title } = validatedBody<{ title: string }>(req);
  const task = await taskService.createSubtask(req.user, taskId, title);
  sendSuccess(res, { task }, { status: 201, message: `Subtask ${task.displayKey} created.` });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { taskId } = validatedParams<TaskIdParams>(req);
  await taskService.deleteTask(req.user, taskId);
  sendSuccess(res, null, { message: 'Task deleted.' });
});

export const board = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId } = validatedParams<ProjectIdParams>(req);
  const query = validatedQuery<BoardQuery>(req);
  sendSuccess(res, await boardService.getBoard(req.user, projectId, query));
});

export const move = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { taskId } = validatedParams<TaskIdParams>(req);
  const { statusId, targetIndex, version } = validatedBody<{ statusId: string; targetIndex: number; version: number }>(req);
  const task = await boardService.moveTask(req.user, taskId, statusId, targetIndex, version);
  sendSuccess(res, { task }, { message: `Task ${task.key} moved to ${task.status.name}.` });
});

export const bulk = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const input = validatedBody<BulkTaskInput>(req);
  const result = await boardService.bulkUpdateTasks(req.user, input);
  sendSuccess(res, result, { message: `${result.updated} task${result.updated === 1 ? '' : 's'} updated.` });
});

export const activity = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { taskId } = validatedParams<TaskIdParams>(req);
  const query = validatedQuery<{ page: number; pageSize: number }>(req);
  const { items, total } = await taskService.listTaskActivity(req.user, taskId, query);
  sendSuccess(
    res,
    {
      activity: items.map((entry) => ({
        id: entry.id,
        action: entry.action,
        field: entry.field,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        metadata: entry.metadata,
        actor: { id: entry.actorUserId, displayName: entry.actorNameSnapshot },
        createdAt: entry.createdAt.toISOString(),
      })),
    },
    { meta: paginationMeta(query.page, query.pageSize, total) },
  );
});
