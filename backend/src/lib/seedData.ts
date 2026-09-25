import type { PrismaClient } from '@prisma/client';
import { PERMISSIONS, PERMISSION_DESCRIPTIONS, ROLE_PERMISSIONS } from './permissions';

/**
 * Idempotent base data: configurable vocabularies and the permission matrix.
 * Shared by `prisma/seed.ts` and the test suite so both see the same world.
 */

export const PROJECT_STATUS_SEED = [
  { key: 'PLANNING', name: 'Planning', category: 'PLANNING', color: '#8b5cf6', sortOrder: 10, isDefault: true },
  { key: 'ACTIVE', name: 'Active', category: 'ACTIVE', color: '#22c55e', sortOrder: 20, isDefault: false },
  { key: 'ON_HOLD', name: 'On Hold', category: 'ON_HOLD', color: '#f59e0b', sortOrder: 30, isDefault: false },
  { key: 'COMPLETED', name: 'Completed', category: 'COMPLETED', color: '#0ea5e9', sortOrder: 40, isDefault: false },
  { key: 'ARCHIVED', name: 'Archived', category: 'ARCHIVED', color: '#64748b', sortOrder: 50, isDefault: false },
] as const;

export const TASK_STATUS_SEED = [
  { key: 'BACKLOG', name: 'Backlog', category: 'BACKLOG', color: '#64748b', sortOrder: 10, isDefault: true },
  { key: 'TODO', name: 'To Do', category: 'TODO', color: '#8b5cf6', sortOrder: 20, isDefault: false },
  { key: 'IN_PROGRESS', name: 'In Progress', category: 'IN_PROGRESS', color: '#3b82f6', sortOrder: 30, isDefault: false },
  { key: 'IN_REVIEW', name: 'In Review', category: 'REVIEW', color: '#f59e0b', sortOrder: 40, isDefault: false },
  { key: 'TESTING', name: 'Testing', category: 'TESTING', color: '#06b6d4', sortOrder: 50, isDefault: false },
  { key: 'BLOCKED', name: 'Blocked', category: 'BLOCKED', color: '#ef4444', sortOrder: 60, isDefault: false },
  { key: 'DONE', name: 'Done', category: 'DONE', color: '#22c55e', sortOrder: 70, isDefault: false },
  { key: 'CANCELLED', name: 'Cancelled', category: 'CANCELLED', color: '#94a3b8', sortOrder: 80, isDefault: false },
] as const;

export const TASK_PRIORITY_SEED = [
  { key: 'CRITICAL', name: 'Critical', weight: 4, color: '#dc2626', sortOrder: 10, isDefault: false },
  { key: 'HIGH', name: 'High', weight: 3, color: '#f97316', sortOrder: 20, isDefault: false },
  { key: 'MEDIUM', name: 'Medium', weight: 2, color: '#eab308', sortOrder: 30, isDefault: true },
  { key: 'LOW', name: 'Low', weight: 1, color: '#38bdf8', sortOrder: 40, isDefault: false },
] as const;

export const TASK_TYPE_SEED = [
  { key: 'FEATURE', name: 'Feature', icon: 'sparkles', color: '#6366f1', sortOrder: 10, isDefault: true },
  { key: 'BUG', name: 'Bug', icon: 'bug', color: '#ef4444', sortOrder: 20, isDefault: false },
  { key: 'IMPROVEMENT', name: 'Improvement', icon: 'trending-up', color: '#0ea5e9', sortOrder: 30, isDefault: false },
  { key: 'RESEARCH', name: 'Research', icon: 'search', color: '#a855f7', sortOrder: 40, isDefault: false },
  { key: 'DOCUMENTATION', name: 'Documentation', icon: 'book', color: '#14b8a6', sortOrder: 50, isDefault: false },
  { key: 'MAINTENANCE', name: 'Maintenance', icon: 'wrench', color: '#f59e0b', sortOrder: 60, isDefault: false },
  { key: 'DEPLOYMENT', name: 'Deployment', icon: 'rocket', color: '#22c55e', sortOrder: 70, isDefault: false },
  { key: 'TESTING', name: 'Testing', icon: 'flask', color: '#06b6d4', sortOrder: 80, isDefault: false },
] as const;

export interface SeedSummary {
  projectStatuses: number;
  taskStatuses: number;
  taskPriorities: number;
  taskTypes: number;
  permissions: number;
  rolePermissions: number;
}

export async function seedBaseData(client: PrismaClient): Promise<SeedSummary> {
  for (const status of PROJECT_STATUS_SEED) {
    await client.projectStatus.upsert({
      where: { key: status.key },
      update: {
        name: status.name,
        category: status.category,
        color: status.color,
        sortOrder: status.sortOrder,
        isDefault: status.isDefault,
        isSystem: true,
      },
      create: { ...status, isSystem: true },
    });
  }

  for (const status of TASK_STATUS_SEED) {
    await client.taskStatus.upsert({
      where: { key: status.key },
      update: {
        name: status.name,
        category: status.category,
        color: status.color,
        sortOrder: status.sortOrder,
        isDefault: status.isDefault,
        isSystem: true,
      },
      create: { ...status, isSystem: true },
    });
  }

  for (const priority of TASK_PRIORITY_SEED) {
    await client.taskPriority.upsert({
      where: { key: priority.key },
      update: {
        name: priority.name,
        weight: priority.weight,
        color: priority.color,
        sortOrder: priority.sortOrder,
        isDefault: priority.isDefault,
        isSystem: true,
      },
      create: { ...priority, isSystem: true },
    });
  }

  for (const type of TASK_TYPE_SEED) {
    await client.taskType.upsert({
      where: { key: type.key },
      update: {
        name: type.name,
        icon: type.icon,
        color: type.color,
        sortOrder: type.sortOrder,
        isDefault: type.isDefault,
        isSystem: true,
      },
      create: { ...type, isSystem: true },
    });
  }

  for (const key of PERMISSIONS) {
    await client.permission.upsert({
      where: { key },
      update: { description: PERMISSION_DESCRIPTIONS[key] },
      create: { key, description: PERMISSION_DESCRIPTIONS[key] },
    });
  }

  const permissionRows = await client.permission.findMany({ select: { id: true, key: true } });
  const permissionIdByKey = new Map(permissionRows.map((row) => [row.key, row.id]));

  const rolePairs: { role: keyof typeof ROLE_PERMISSIONS; permissionId: string }[] = [];
  for (const [role, granted] of Object.entries(ROLE_PERMISSIONS) as [
    keyof typeof ROLE_PERMISSIONS,
    readonly string[] | 'all',
  ][]) {
    const keys = granted === 'all' ? PERMISSIONS : granted;
    for (const key of keys) {
      const permissionId = permissionIdByKey.get(key);
      if (permissionId) rolePairs.push({ role, permissionId });
    }
  }

  await client.rolePermission.createMany({ data: rolePairs, skipDuplicates: true });

  return {
    projectStatuses: PROJECT_STATUS_SEED.length,
    taskStatuses: TASK_STATUS_SEED.length,
    taskPriorities: TASK_PRIORITY_SEED.length,
    taskTypes: TASK_TYPE_SEED.length,
    permissions: PERMISSIONS.length,
    rolePermissions: rolePairs.length,
  };
}
