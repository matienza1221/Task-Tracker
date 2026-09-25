import type { GlobalRole, ProjectRole, Task, User } from '@prisma/client';
import { prisma } from '../../src/db/prisma';
import { hashPassword } from '../../src/lib/password';
import { seedBaseData } from '../../src/lib/seedData';

const TABLES = [
  'audit_logs',
  'mail_outbox',
  'password_reset_tokens',
  'sessions',
  'role_permissions',
  'permissions',
  'task_types',
  'task_priorities',
  'task_statuses',
  'project_statuses',
  'activity_logs',
  'saved_views',
  'labels',
  'milestones',
  'project_members',
  'projects',
  'users',
];

/** Truncates every table and re-seeds base vocabularies/permissions. */
export async function resetDatabase(): Promise<void> {
  const quoted = TABLES.map((table) => `"${table}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
  await seedBaseData(prisma);
}

export const TEST_PASSWORD = 'Test_Password_123!';

export async function createTestUser(overrides: {
  email: string;
  password?: string;
  globalRole?: GlobalRole;
  displayName?: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
  lockedUntil?: Date;
}): Promise<User & { plainPassword: string }> {
  const password = overrides.password ?? TEST_PASSWORD;
  const user = await prisma.user.create({
    data: {
      email: overrides.email,
      displayName: overrides.displayName ?? 'Test User',
      passwordHash: await hashPassword(password),
      globalRole: overrides.globalRole ?? 'DEVELOPER',
      isActive: overrides.isActive ?? true,
      mustChangePassword: overrides.mustChangePassword ?? false,
      lockedUntil: overrides.lockedUntil ?? null,
    },
  });
  return Object.assign(user, { plainPassword: password });
}

async function defaultProjectStatus() {
  return prisma.projectStatus.findFirstOrThrow({ where: { isDefault: true } });
}

async function defaultPriority() {
  return prisma.taskPriority.findFirstOrThrow({ where: { isDefault: true } });
}

/**
 * Creates a project directly in the database (bypassing the API) for test
 * fixtures, including the manager's membership row — the same invariant the
 * service maintains.
 */
export async function createProjectFixture(options: {
  manager: User;
  code?: string;
  name?: string;
  statusKey?: string;
}): Promise<{ id: string; code: string; name: string }> {
  const status = options.statusKey
    ? await prisma.projectStatus.findFirstOrThrow({ where: { key: options.statusKey } })
    : await defaultProjectStatus();
  const priority = await defaultPriority();

  const project = await prisma.project.create({
    data: {
      code: options.code ?? `P${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      name: options.name ?? 'Fixture Project',
      statusId: status.id,
      priorityId: priority.id,
      managerId: options.manager.id,
      createdById: options.manager.id,
    },
  });

  await prisma.projectMember.create({
    data: { projectId: project.id, userId: options.manager.id, projectRole: 'MANAGER', addedById: options.manager.id },
  });

  return { id: project.id, code: project.code, name: project.name };
}

export async function addMemberFixture(projectId: string, user: User, projectRole: ProjectRole = 'DEVELOPER') {
  return prisma.projectMember.create({ data: { projectId, userId: user.id, projectRole } });
}

export async function createMilestoneFixture(projectId: string, name = 'MVP Release') {
  return prisma.milestone.create({ data: { projectId, name } });
}

export async function createLabelFixture(projectId: string, name = 'Frontend', color = '#6366f1') {
  return prisma.label.create({ data: { projectId, name, color } });
}

/** Creates a task directly in the database with a freshly allocated key. */
export async function createTaskFixture(options: {
  projectId: string;
  reporter: User;
  title?: string;
  statusKey?: string;
  priorityKey?: string;
  assigneeId?: string | null;
  parentTaskId?: string | null;
  milestoneId?: string | null;
  progress?: number;
  estimatedHours?: number | null;
  actualHours?: number;
  dueDate?: string | null;
  startDate?: string | null;
}): Promise<Task> {
  const status = options.statusKey
    ? await prisma.taskStatus.findFirstOrThrow({ where: { key: options.statusKey } })
    : await prisma.taskStatus.findFirstOrThrow({ where: { isDefault: true } });
  const priority = options.priorityKey
    ? await prisma.taskPriority.findFirstOrThrow({ where: { key: options.priorityKey } })
    : await prisma.taskPriority.findFirstOrThrow({ where: { isDefault: true } });
  const type = await prisma.taskType.findFirstOrThrow({ where: { isDefault: true } });

  const sequence = await prisma.project.update({
    where: { id: options.projectId },
    data: { taskSequence: { increment: 1 } },
    select: { taskSequence: true, code: true },
  });

  return prisma.task.create({
    data: {
      projectId: options.projectId,
      number: sequence.taskSequence,
      key: `${sequence.code}-${sequence.taskSequence}`,
      title: options.title ?? 'Fixture Task',
      statusId: status.id,
      priorityId: priority.id,
      typeId: type.id,
      reporterId: options.reporter.id,
      assigneeId: options.assigneeId ?? null,
      parentTaskId: options.parentTaskId ?? null,
      milestoneId: options.milestoneId ?? null,
      progress: options.progress ?? 0,
      estimatedHours: options.estimatedHours ?? null,
      actualHours: options.actualHours ?? 0,
      dueDate: options.dueDate ? new Date(`${options.dueDate}T00:00:00.000Z`) : null,
      startDate: options.startDate ? new Date(`${options.startDate}T00:00:00.000Z`) : null,
      completedAt: status.category === 'DONE' ? new Date() : null,
    },
  });
}
