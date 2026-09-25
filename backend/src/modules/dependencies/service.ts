import type { User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { assertProjectPermission } from '../../lib/access';
import { wouldCreateCycle, toDependencyRef, type DependencyRef } from '../../lib/dependencies';
import { conflict, notFound, validationError } from '../../lib/errors';
import { loadTaskForPermission } from '../../lib/resourceGuards';
import { recordActivity } from '../activity/service';
import { recordAudit } from '../audit/service';

export const dependencySelect = {
  id: true,
  key: true,
  title: true,
  dueDate: true,
  status: { select: { name: true, category: true, color: true } },
  project: { select: { id: true, code: true } },
} as const;

async function loadDependencyRefs(taskId: string): Promise<{ blockedBy: DependencyRef[]; blocks: DependencyRef[] }> {
  const [blockedByRows, blocksRows] = await Promise.all([
    prisma.taskDependency.findMany({
      where: { taskId },
      include: { dependsOn: { select: dependencySelect } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.taskDependency.findMany({
      where: { dependsOnTaskId: taskId },
      include: { task: { select: dependencySelect } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return {
    blockedBy: blockedByRows
      .filter((row) => row.dependsOn)
      .map((row) => toDependencyRef(row.dependsOn)),
    blocks: blocksRows.map((row) => toDependencyRef(row.task)),
  };
}

export async function listDependencies(user: User, taskId: string) {
  const { task } = await loadTaskForPermission(user, taskId, 'task:view');
  return loadDependencyRefs(task.id);
}

/**
 * Adds `taskId depends on dependsOnTaskId`. Cross-project dependencies are
 * allowed only when the caller may manage dependencies in *both* projects;
 * self-dependencies and cycles are rejected.
 */
export async function addDependency(user: User, taskId: string, dependsOnTaskId: string) {
  const { task } = await loadTaskForPermission(user, taskId, 'task:manage_dependencies');

  if (task.id === dependsOnTaskId) {
    throw validationError('A task cannot depend on itself.', [
      { path: 'dependsOnTaskId', message: 'A task cannot depend on itself.' },
    ]);
  }

  const dependency = await prisma.task.findFirst({ where: { id: dependsOnTaskId, deletedAt: null } });
  if (!dependency) throw notFound('The task to depend on was not found.');

  if (dependency.projectId !== task.projectId) {
    // 404 when the other project is invisible, 403 when visible without permission.
    await assertProjectPermission(user, dependency.projectId, 'task:manage_dependencies');
  }

  const existing = await prisma.taskDependency.findUnique({
    where: { taskId_dependsOnTaskId: { taskId: task.id, dependsOnTaskId } },
  });
  if (existing) throw conflict('This dependency already exists.');

  await prisma.$transaction(async (tx) => {
    const cyclic = await wouldCreateCycle(tx, task.id, dependsOnTaskId);
    if (cyclic) {
      throw validationError('This dependency would create a circular dependency.', [
        { path: 'dependsOnTaskId', message: `${dependency.key} already depends on ${task.key}, directly or indirectly.` },
      ]);
    }
    await tx.taskDependency.create({ data: { taskId: task.id, dependsOnTaskId, createdById: user.id } });
  });

  await recordActivity({
    projectId: task.projectId,
    taskId: task.id,
    actor: user,
    action: 'DEPENDENCY_ADDED',
    metadata: { key: task.key, dependsOnKey: dependency.key, dependsOnTaskId },
  });
  await recordAudit({
    action: 'TASK_UPDATED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'task',
    resourceId: task.id,
    metadata: { dependency: 'added', dependsOnTaskId, projectId: task.projectId },
  });

  return loadDependencyRefs(task.id);
}

export async function removeDependency(user: User, taskId: string, dependsOnTaskId: string) {
  const { task } = await loadTaskForPermission(user, taskId, 'task:manage_dependencies');

  const dependency = await prisma.taskDependency.findUnique({
    where: { taskId_dependsOnTaskId: { taskId: task.id, dependsOnTaskId } },
    include: { dependsOn: { select: { key: true } } },
  });
  if (!dependency) throw notFound('Dependency not found.');

  await prisma.taskDependency.delete({ where: { id: dependency.id } });

  await recordActivity({
    projectId: task.projectId,
    taskId: task.id,
    actor: user,
    action: 'DEPENDENCY_REMOVED',
    metadata: { key: task.key, dependsOnKey: dependency.dependsOn.key, dependsOnTaskId },
  });
  await recordAudit({
    action: 'TASK_UPDATED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'task',
    resourceId: task.id,
    metadata: { dependency: 'removed', dependsOnTaskId, projectId: task.projectId },
  });

  return loadDependencyRefs(task.id);
}
