import type { ProjectStatusCategory, TaskStatusCategory, User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { conflict, notFound, validationError } from '../../lib/errors';
import { recordAudit } from '../audit/service';
import { PROJECT_STATUS_CATEGORIES, TASK_STATUS_CATEGORIES, type CreateVocabularyInput, type UpdateVocabularyInput, type VocabularyKind } from './schemas';

export interface VocabularyItemDto {
  id: string;
  key: string;
  name: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
  isDefault: boolean;
  isSystem: boolean;
  usageCount: number;
  category?: string;
  weight?: number;
  icon?: string;
}

export interface VocabularyCatalog {
  taskStatuses: VocabularyItemDto[];
  taskPriorities: VocabularyItemDto[];
  taskTypes: VocabularyItemDto[];
  projectStatuses: VocabularyItemDto[];
  categories: { taskStatuses: readonly string[]; projectStatuses: readonly string[] };
}

function slugKey(name: string): string {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return slug || 'ITEM';
}

async function uniqueKey(exists: (key: string) => Promise<boolean>, base: string): Promise<string> {
  let key = base;
  let suffix = 2;
  while (await exists(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  return key;
}

export async function listVocabularies(): Promise<VocabularyCatalog> {
  const [
    taskStatuses,
    taskPriorities,
    taskTypes,
    projectStatuses,
    statusUsage,
    priorityUsage,
    typeUsage,
    projectStatusUsage,
  ] = await Promise.all([
    prisma.taskStatus.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.taskPriority.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.taskType.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.projectStatus.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.task.groupBy({ by: ['statusId'], _count: { _all: true } }),
    prisma.task.groupBy({ by: ['priorityId'], _count: { _all: true } }),
    prisma.task.groupBy({ by: ['typeId'], _count: { _all: true } }),
    prisma.project.groupBy({ by: ['statusId'], _count: { _all: true }, where: { deletedAt: null } }),
  ]);

  const usage = (rows: { _count: { _all: number } }[], key: string, id: string) =>
    rows.find((row) => (row as unknown as Record<string, string>)[key] === id)?._count._all ?? 0;

  return {
    taskStatuses: taskStatuses.map((item) => ({
      id: item.id,
      key: item.key,
      name: item.name,
      category: item.category,
      color: item.color,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
      isDefault: item.isDefault,
      isSystem: item.isSystem,
      usageCount: usage(statusUsage, 'statusId', item.id),
    })),
    taskPriorities: taskPriorities.map((item) => ({
      id: item.id,
      key: item.key,
      name: item.name,
      weight: item.weight,
      color: item.color,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
      isDefault: item.isDefault,
      isSystem: item.isSystem,
      usageCount: usage(priorityUsage, 'priorityId', item.id),
    })),
    taskTypes: taskTypes.map((item) => ({
      id: item.id,
      key: item.key,
      name: item.name,
      icon: item.icon,
      color: item.color,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
      isDefault: item.isDefault,
      isSystem: item.isSystem,
      usageCount: usage(typeUsage, 'typeId', item.id),
    })),
    projectStatuses: projectStatuses.map((item) => ({
      id: item.id,
      key: item.key,
      name: item.name,
      category: item.category,
      color: item.color,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
      isDefault: item.isDefault,
      isSystem: item.isSystem,
      usageCount: usage(projectStatusUsage, 'statusId', item.id),
    })),
    categories: { taskStatuses: TASK_STATUS_CATEGORIES, projectStatuses: PROJECT_STATUS_CATEGORIES },
  };
}

const RESOURCE_TYPE: Record<VocabularyKind, string> = {
  'task-statuses': 'task_status',
  'task-priorities': 'task_priority',
  'task-types': 'task_type',
  'project-statuses': 'project_status',
};

async function assertCategory(kind: VocabularyKind, category: string | undefined): Promise<void> {
  if (kind === 'task-statuses') {
    if (!category || !TASK_STATUS_CATEGORIES.includes(category as TaskStatusCategory)) {
      throw validationError('A valid workflow category is required for a task status.', [
        { path: 'category', message: `Category must be one of: ${TASK_STATUS_CATEGORIES.join(', ')}.` },
      ]);
    }
  }
  if (kind === 'project-statuses') {
    if (!category || !PROJECT_STATUS_CATEGORIES.includes(category as ProjectStatusCategory)) {
      throw validationError('A valid category is required for a project status.', [
        { path: 'category', message: `Category must be one of: ${PROJECT_STATUS_CATEGORIES.join(', ')}.` },
      ]);
    }
  }
}

async function assertNotLastActive(kind: VocabularyKind, id: string): Promise<void> {
  const where = { isActive: true, id: { not: id } } as const;
  const counts: Record<VocabularyKind, () => Promise<number>> = {
    'task-statuses': () => prisma.taskStatus.count({ where }),
    'task-priorities': () => prisma.taskPriority.count({ where }),
    'task-types': () => prisma.taskType.count({ where }),
    'project-statuses': () => prisma.projectStatus.count({ where }),
  };
  if ((await counts[kind]()) === 0) {
    throw conflict('At least one active entry must remain.');
  }
}

export async function createVocabularyItem(
  kind: VocabularyKind,
  input: CreateVocabularyInput,
  actor: User,
): Promise<VocabularyItemDto> {
  await assertCategory(kind, input.category);

  let created: VocabularyItemDto;
  switch (kind) {
    case 'task-statuses': {
      const key = await uniqueKey(async (candidate) => Boolean(await prisma.taskStatus.findUnique({ where: { key: candidate } })), slugKey(input.name));
      created = await prisma.$transaction(async (tx) => {
        if (input.isDefault) await tx.taskStatus.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        const row = await tx.taskStatus.create({
          data: {
            key,
            name: input.name,
            category: input.category as TaskStatusCategory,
            color: input.color ?? '#64748b',
            sortOrder: input.sortOrder ?? 100,
            isActive: true,
            isDefault: input.isDefault ?? false,
          },
        });
        return { ...row, usageCount: 0 };
      });
      break;
    }
    case 'task-priorities': {
      const key = await uniqueKey(async (candidate) => Boolean(await prisma.taskPriority.findUnique({ where: { key: candidate } })), slugKey(input.name));
      created = await prisma.$transaction(async (tx) => {
        if (input.isDefault) await tx.taskPriority.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        const row = await tx.taskPriority.create({
          data: {
            key,
            name: input.name,
            weight: input.weight ?? 1,
            color: input.color ?? '#64748b',
            sortOrder: input.sortOrder ?? 100,
            isActive: true,
            isDefault: input.isDefault ?? false,
          },
        });
        return { ...row, usageCount: 0 };
      });
      break;
    }
    case 'task-types': {
      const key = await uniqueKey(async (candidate) => Boolean(await prisma.taskType.findUnique({ where: { key: candidate } })), slugKey(input.name));
      created = await prisma.$transaction(async (tx) => {
        if (input.isDefault) await tx.taskType.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        const row = await tx.taskType.create({
          data: {
            key,
            name: input.name,
            icon: input.icon ?? 'square',
            color: input.color ?? '#64748b',
            sortOrder: input.sortOrder ?? 100,
            isActive: true,
            isDefault: input.isDefault ?? false,
          },
        });
        return { ...row, usageCount: 0 };
      });
      break;
    }
    case 'project-statuses': {
      const key = await uniqueKey(async (candidate) => Boolean(await prisma.projectStatus.findUnique({ where: { key: candidate } })), slugKey(input.name));
      created = await prisma.$transaction(async (tx) => {
        if (input.isDefault) await tx.projectStatus.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        const row = await tx.projectStatus.create({
          data: {
            key,
            name: input.name,
            category: input.category as ProjectStatusCategory,
            color: input.color ?? '#64748b',
            sortOrder: input.sortOrder ?? 100,
            isActive: true,
            isDefault: input.isDefault ?? false,
          },
        });
        return { ...row, usageCount: 0 };
      });
      break;
    }
    default:
      throw notFound('Unknown vocabulary kind.');
  }

  await recordAudit({
    action: 'VOCABULARY_CHANGED',
    actorUserId: actor.id,
    actorEmail: actor.email,
    resourceType: RESOURCE_TYPE[kind],
    resourceId: created.id,
    metadata: { operation: 'create', name: created.name },
  });

  return created;
}

async function loadItem(kind: VocabularyKind, id: string) {
  const loaders: Record<VocabularyKind, () => Promise<{ id: string; isDefault: boolean; isSystem: boolean; isActive: boolean } | null>> = {
    'task-statuses': () => prisma.taskStatus.findUnique({ where: { id } }),
    'task-priorities': () => prisma.taskPriority.findUnique({ where: { id } }),
    'task-types': () => prisma.taskType.findUnique({ where: { id } }),
    'project-statuses': () => prisma.projectStatus.findUnique({ where: { id } }),
  };
  const item = await loaders[kind]();
  if (!item) throw notFound('Vocabulary entry not found.');
  return item;
}

export async function updateVocabularyItem(
  kind: VocabularyKind,
  id: string,
  input: UpdateVocabularyInput,
  actor: User,
): Promise<VocabularyItemDto> {
  const existing = await loadItem(kind, id);
  if (input.category !== undefined) await assertCategory(kind, input.category);

  if (input.isActive === false) {
    if (existing.isDefault) throw conflict('Choose another default entry before deactivating this one.');
    await assertNotLastActive(kind, id);
  }

  const common = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  };

  const clearDefaults = async (tx: typeof prisma) => {
    if (input.isDefault !== true) return;
    switch (kind) {
      case 'task-statuses':
        await tx.taskStatus.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        break;
      case 'task-priorities':
        await tx.taskPriority.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        break;
      case 'task-types':
        await tx.taskType.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        break;
      case 'project-statuses':
        await tx.projectStatus.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        break;
    }
  };

  let updated: VocabularyItemDto;
  switch (kind) {
    case 'task-statuses':
      updated = await prisma.$transaction(async (tx) => {
        await clearDefaults(tx as typeof prisma);
        const row = await tx.taskStatus.update({
          where: { id },
          data: { ...common, ...(input.category ? { category: input.category as TaskStatusCategory } : {}), ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}) },
        });
        return { ...row, usageCount: await tx.task.count({ where: { statusId: id } }) };
      });
      break;
    case 'task-priorities':
      updated = await prisma.$transaction(async (tx) => {
        await clearDefaults(tx as typeof prisma);
        const row = await tx.taskPriority.update({
          where: { id },
          data: { ...common, ...(input.weight !== undefined ? { weight: input.weight } : {}), ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}) },
        });
        return { ...row, usageCount: await tx.task.count({ where: { priorityId: id } }) };
      });
      break;
    case 'task-types':
      updated = await prisma.$transaction(async (tx) => {
        await clearDefaults(tx as typeof prisma);
        const row = await tx.taskType.update({
          where: { id },
          data: { ...common, ...(input.icon !== undefined ? { icon: input.icon } : {}), ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}) },
        });
        return { ...row, usageCount: await tx.task.count({ where: { typeId: id } }) };
      });
      break;
    case 'project-statuses':
      updated = await prisma.$transaction(async (tx) => {
        await clearDefaults(tx as typeof prisma);
        const row = await tx.projectStatus.update({
          where: { id },
          data: { ...common, ...(input.category ? { category: input.category as ProjectStatusCategory } : {}), ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}) },
        });
        return { ...row, usageCount: await tx.project.count({ where: { statusId: id, deletedAt: null } }) };
      });
      break;
    default:
      throw notFound('Unknown vocabulary kind.');
  }

  await recordAudit({
    action: 'VOCABULARY_CHANGED',
    actorUserId: actor.id,
    actorEmail: actor.email,
    resourceType: RESOURCE_TYPE[kind],
    resourceId: id,
    metadata: { operation: 'update', fields: Object.keys(input) },
  });

  return updated;
}

export async function deleteVocabularyItem(
  kind: VocabularyKind,
  id: string,
  options: { hard: boolean },
  actor: User,
): Promise<void> {
  const existing = await loadItem(kind, id);

  if (options.hard) {
    if (existing.isSystem) {
      throw conflict('Built-in entries cannot be deleted; deactivate them instead.');
    }
    const catalog = await listVocabularies();
    const usageByKind: Record<VocabularyKind, number> = {
      'task-statuses': catalog.taskStatuses.find((item) => item.id === id)?.usageCount ?? 0,
      'task-priorities': catalog.taskPriorities.find((item) => item.id === id)?.usageCount ?? 0,
      'task-types': catalog.taskTypes.find((item) => item.id === id)?.usageCount ?? 0,
      'project-statuses': catalog.projectStatuses.find((item) => item.id === id)?.usageCount ?? 0,
    };
    if (usageByKind[kind] > 0) {
      throw conflict('This entry is still in use. Deactivate it instead of deleting it.');
    }
    const deleters: Record<VocabularyKind, () => Promise<unknown>> = {
      'task-statuses': () => prisma.taskStatus.delete({ where: { id } }),
      'task-priorities': () => prisma.taskPriority.delete({ where: { id } }),
      'task-types': () => prisma.taskType.delete({ where: { id } }),
      'project-statuses': () => prisma.projectStatus.delete({ where: { id } }),
    };
    await deleters[kind]();
  } else {
    if (existing.isDefault) throw conflict('Choose another default entry before deactivating this one.');
    await assertNotLastActive(kind, id);
    const deactivators: Record<VocabularyKind, () => Promise<unknown>> = {
      'task-statuses': () => prisma.taskStatus.update({ where: { id }, data: { isActive: false } }),
      'task-priorities': () => prisma.taskPriority.update({ where: { id }, data: { isActive: false } }),
      'task-types': () => prisma.taskType.update({ where: { id }, data: { isActive: false } }),
      'project-statuses': () => prisma.projectStatus.update({ where: { id }, data: { isActive: false } }),
    };
    await deactivators[kind]();
  }

  await recordAudit({
    action: 'VOCABULARY_CHANGED',
    actorUserId: actor.id,
    actorEmail: actor.email,
    resourceType: RESOURCE_TYPE[kind],
    resourceId: id,
    metadata: { operation: options.hard ? 'delete' : 'deactivate' },
  });
}
