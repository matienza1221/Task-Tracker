import type { Request, Response } from 'express';
import { asyncHandler, unauthenticated } from '../../lib/errors';
import { paginationMeta, sendSuccess } from '../../lib/response';
import { validatedBody, validatedParams, validatedQuery } from '../../middleware/validate';
import { listActivity } from '../activity/service';
import * as projectService from './projectService';
import type { CreateProjectInput, ListProjectsQuery, UpdateProjectInput } from './schemas';

type ProjectIdParams = { projectId: string };

export const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const query = validatedQuery<ListProjectsQuery>(req);
  const { items, total } = await projectService.listProjects(req.user, query);
  sendSuccess(res, { projects: items }, { meta: paginationMeta(query.page, query.pageSize, total) });
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId } = validatedParams<ProjectIdParams>(req);
  sendSuccess(res, { project: await projectService.getProject(req.user, projectId) });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const input = validatedBody<CreateProjectInput>(req);
  const project = await projectService.createProject(req.user, input);
  sendSuccess(res, { project }, { status: 201, message: 'Project created successfully.' });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId } = validatedParams<ProjectIdParams>(req);
  const input = validatedBody<UpdateProjectInput>(req);
  const project = await projectService.updateProject(req.user, projectId, input);
  sendSuccess(res, { project }, { message: 'Project updated successfully.' });
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId } = validatedParams<ProjectIdParams>(req);
  const project = await projectService.setProjectArchived(req.user, projectId, true);
  sendSuccess(res, { project }, { message: 'Project archived.' });
});

export const unarchive = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId } = validatedParams<ProjectIdParams>(req);
  const project = await projectService.setProjectArchived(req.user, projectId, false);
  sendSuccess(res, { project }, { message: 'Project restored from archive.' });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId } = validatedParams<ProjectIdParams>(req);
  const { purge } = validatedQuery<{ purge: boolean }>(req);
  await projectService.deleteProject(req.user, projectId, { purge });
  sendSuccess(res, null, { message: purge ? 'Project permanently deleted.' : 'Project deleted.' });
});

export const activity = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw unauthenticated();
  const { projectId } = validatedParams<ProjectIdParams>(req);
  const query = validatedQuery<{ page: number; pageSize: number }>(req);
  const { project } = { project: await projectService.getProject(req.user, projectId) };
  const { items, total } = await listActivity(project.id, query);
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
        task: entry.task ? { id: entry.task.id, key: entry.task.key } : null,
        createdAt: entry.createdAt.toISOString(),
      })),
    },
    { meta: paginationMeta(query.page, query.pageSize, total) },
  );
});
