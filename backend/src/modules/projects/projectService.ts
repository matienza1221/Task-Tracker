import type { Prisma, User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { accessibleProjectWhere, assertProjectPermission } from '../../lib/access';
import { conflict, forbidden, notFound, validationError } from '../../lib/errors';
import { roleHasPermission } from '../../lib/permissions';
import { recordAudit } from '../audit/service';
import { recordActivity } from '../activity/service';
import { projectInclude, parseDateOnly, toProjectSummary, type ProjectSummaryDto } from './dto';
import type { CreateProjectInput, ListProjectsQuery, UpdateProjectInput } from './schemas';

async function getDefaultIds(): Promise<{ statusId: string; priorityId: string }> {
  const [status, priority] = await Promise.all([
    prisma.projectStatus.findFirst({
      where: { isActive: true, OR: [{ isDefault: true }, { category: 'PLANNING' }] },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
    }),
    prisma.taskPriority.findFirst({ where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }] }),
  ]);
  if (!status || !priority) throw notFound('Default project status or priority is not configured.');
  return { statusId: status.id, priorityId: priority.id };
}

async function assertUserAssignable(userId: string): Promise<void> {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null, isActive: true } });
  if (!user) throw validationError('The selected user is not an active account.', [
    { path: 'managerId', message: 'The selected user is not an active account.' },
  ]);
}

/**
 * Projects visible to the caller. Admin sees everything; everyone else sees
 * only projects they are a member of or manage. Scoping happens in SQL — list
 * endpoints never fetch-then-filter (ARCHITECTURE.md §8.3).
 */
export async function listProjects(
  user: User,
  query: ListProjectsQuery,
): Promise<{ items: ProjectSummaryDto[]; total: number }> {
  const filters: Prisma.ProjectWhereInput[] = [accessibleProjectWhere(user)];

  if (!query.includeArchived) filters.push({ isArchived: false });
  if (query.statusKey) filters.push({ status: { key: query.statusKey } });
  if (query.search) {
    filters.push({
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ],
    });
  }

  const where: Prisma.ProjectWhereInput = { deletedAt: null, AND: filters };

  const [rows, total, memberships] = await Promise.all([
    prisma.project.findMany({
      where,
      include: projectInclude,
      orderBy: [{ isArchived: 'asc' }, { updatedAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.project.count({ where }),
    prisma.projectMember.findMany({ where: { userId: user.id }, select: { projectId: true, projectRole: true } }),
  ]);

  const roleByProject = new Map(memberships.map((membership) => [membership.projectId, membership.projectRole]));

  const items = rows.map((project) =>
    toProjectSummary(project, user.globalRole === 'ADMIN' ? 'ADMIN' : roleByProject.get(project.id) ?? null),
  );

  return { items, total };
}

export async function getProject(user: User, projectId: string): Promise<ProjectSummaryDto> {
  const access = await assertProjectPermission(user, projectId, 'project:view');
  const project = await prisma.project.findFirstOrThrow({
    where: { id: access.project.id, deletedAt: null },
    include: projectInclude,
  });
  return toProjectSummary(project, access.role);
}

export async function createProject(user: User, input: CreateProjectInput): Promise<ProjectSummaryDto> {
  const defaults = await getDefaultIds();

  const existing = await prisma.project.findFirst({ where: { code: input.code, deletedAt: null } });
  if (existing) throw conflict('A project with this code already exists.');

  const managerId = input.managerId ?? user.id;
  if (managerId !== user.id) await assertUserAssignable(managerId);

  if (input.statusId) {
    const status = await prisma.projectStatus.findFirst({ where: { id: input.statusId, isActive: true } });
    if (!status) throw validationError('Unknown project status.', [{ path: 'statusId', message: 'Unknown project status.' }]);
  }
  if (input.priorityId) {
    const priority = await prisma.taskPriority.findFirst({ where: { id: input.priorityId, isActive: true } });
    if (!priority) throw validationError('Unknown priority.', [{ path: 'priorityId', message: 'Unknown priority.' }]);
  }

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        statusId: input.statusId ?? defaults.statusId,
        priorityId: input.priorityId ?? defaults.priorityId,
        startDate: input.startDate ? parseDateOnly(input.startDate) : null,
        targetDate: input.targetDate ? parseDateOnly(input.targetDate) : null,
        managerId,
        createdById: user.id,
      },
    });

    // The manager is always a member with the MANAGER project role. When a
    // different manager is chosen, the creator keeps MANAGER membership so the
    // project they just created remains visible to them.
    await tx.projectMember.create({
      data: { projectId: created.id, userId: managerId, projectRole: 'MANAGER', addedById: user.id },
    });
    if (managerId !== user.id) {
      await tx.projectMember.create({
        data: { projectId: created.id, userId: user.id, projectRole: 'MANAGER', addedById: user.id },
      });
    }

    return created;
  });

  await recordActivity({
    projectId: project.id,
    actor: user,
    action: 'PROJECT_CREATED',
    metadata: { code: project.code, name: project.name },
  });
  await recordAudit({
    action: 'PROJECT_CREATED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'project',
    resourceId: project.id,
    metadata: { code: project.code },
  });

  return getProject(user, project.id);
}

export async function updateProject(user: User, projectId: string, input: UpdateProjectInput): Promise<ProjectSummaryDto> {
  const access = await assertProjectPermission(user, projectId, 'project:update');
  const existing = access.project;

  const data: Prisma.ProjectUpdateInput = {};
  const changed: string[] = [];

  if (input.name !== undefined && input.name !== existing.name) {
    data.name = input.name;
    changed.push('name');
  }
  if (input.description !== undefined) {
    data.description = input.description;
    changed.push('description');
  }
  if (input.priorityId !== undefined && input.priorityId !== existing.priorityId) {
    const priority = await prisma.taskPriority.findFirst({ where: { id: input.priorityId, isActive: true } });
    if (!priority) throw validationError('Unknown priority.', [{ path: 'priorityId', message: 'Unknown priority.' }]);
    data.priority = { connect: { id: priority.id } };
    changed.push('priority');
  }
  if (input.progressWeighting !== undefined && input.progressWeighting !== existing.progressWeighting) {
    data.progressWeighting = input.progressWeighting;
    changed.push('progressWeighting');
  }

  const nextStart = input.startDate !== undefined ? input.startDate : existing.startDate?.toISOString().slice(0, 10) ?? null;
  const nextTarget = input.targetDate !== undefined ? input.targetDate : existing.targetDate?.toISOString().slice(0, 10) ?? null;
  if (nextStart && nextTarget && nextTarget < nextStart) {
    throw validationError('Target date cannot be before the start date.', [
      { path: 'targetDate', message: 'Target date cannot be before the start date.' },
    ]);
  }
  if (input.startDate !== undefined) {
    data.startDate = input.startDate ? parseDateOnly(input.startDate) : null;
    changed.push('startDate');
  }
  if (input.targetDate !== undefined) {
    data.targetDate = input.targetDate ? parseDateOnly(input.targetDate) : null;
    changed.push('targetDate');
  }

  if (input.managerId !== undefined && input.managerId !== existing.managerId) {
    if (input.managerId !== null) await assertUserAssignable(input.managerId);
    data.manager = input.managerId ? { connect: { id: input.managerId } } : { disconnect: true };
    changed.push('manager');
    if (input.managerId) {
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: existing.id, userId: input.managerId } },
        update: { projectRole: 'MANAGER' },
        create: { projectId: existing.id, userId: input.managerId, projectRole: 'MANAGER', addedById: user.id },
      });
    }
  }

  let statusChanged: { from: string; to: string } | null = null;
  let statusCategory: string | null = null;
  if (input.statusId !== undefined && input.statusId !== existing.statusId) {
    const status = await prisma.projectStatus.findFirst({ where: { id: input.statusId, isActive: true } });
    if (!status) throw validationError('Unknown project status.', [{ path: 'statusId', message: 'Unknown project status.' }]);
    data.status = { connect: { id: status.id } };
    statusCategory = status.category;
    const previous = await prisma.projectStatus.findUnique({ where: { id: existing.statusId }, select: { name: true } });
    statusChanged = { from: previous?.name ?? 'unknown', to: status.name };
    changed.push('status');
    // Completing a project stamps the completion date; reopening clears it.
    if (status.category === 'COMPLETED') {
      data.actualCompletionDate = existing.actualCompletionDate ?? new Date();
    } else {
      data.actualCompletionDate = null;
    }
  }

  if (changed.length === 0) return getProject(user, projectId);

  await prisma.project.update({ where: { id: existing.id }, data });

  if (statusChanged) {
    await recordActivity({
      projectId: existing.id,
      actor: user,
      action: 'PROJECT_STATUS_CHANGED',
      field: 'status',
      oldValue: statusChanged.from,
      newValue: statusChanged.to,
    });
  }
  await recordActivity({
    projectId: existing.id,
    actor: user,
    action: 'PROJECT_UPDATED',
    metadata: { fields: changed, statusCategory },
  });
  await recordAudit({
    action: 'PROJECT_UPDATED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'project',
    resourceId: existing.id,
    metadata: { fields: changed },
  });

  return getProject(user, projectId);
}

export async function setProjectArchived(user: User, projectId: string, archived: boolean): Promise<ProjectSummaryDto> {
  const access = await assertProjectPermission(user, projectId, 'project:archive');
  const project = access.project;

  if (project.isArchived === archived) return getProject(user, projectId);

  await prisma.project.update({
    where: { id: project.id },
    data: { isArchived: archived, archivedAt: archived ? new Date() : null },
  });

  await recordActivity({ projectId: project.id, actor: user, action: archived ? 'PROJECT_ARCHIVED' : 'PROJECT_UNARCHIVED' });
  await recordAudit({
    action: archived ? 'PROJECT_ARCHIVED' : 'PROJECT_UNARCHIVED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'project',
    resourceId: project.id,
  });

  return getProject(user, projectId);
}

export async function deleteProject(user: User, projectId: string, options: { purge: boolean }): Promise<void> {
  if (options.purge) {
    // Purging is an administrative cleanup step and must also work on a
    // previously (soft) deleted project.
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw notFound('Project not found.');
    if (!roleHasPermission(user.globalRole, 'project:delete')) throw forbidden();

    await prisma.project.delete({ where: { id: projectId } });
    await recordAudit({
      action: 'PROJECT_DELETED',
      actorUserId: user.id,
      actorEmail: user.email,
      resourceType: 'project',
      resourceId: projectId,
      metadata: { purge: true, code: project.code },
    });
    return;
  }

  const access = await assertProjectPermission(user, projectId, 'project:delete');
  const project = access.project;

  await prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date(), isArchived: true } });

  await recordAudit({
    action: 'PROJECT_DELETED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'project',
    resourceId: project.id,
    metadata: { purge: false, code: project.code },
  });
}
