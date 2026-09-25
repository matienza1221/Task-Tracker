import { Router } from 'express';
import { asyncHandler } from '../../lib/errors';
import { sendSuccess } from '../../lib/response';
import { requireAuth } from '../../middleware/auth';
import { prisma } from '../../db/prisma';

const router = Router();

router.use(requireAuth);

/**
 * Configurable vocabularies used by forms (project statuses, task statuses,
 * priorities, types). Only active entries are returned.
 */
router.get(
  '/vocabularies',
  asyncHandler(async (_req, res) => {
    const [projectStatuses, taskStatuses, taskPriorities, taskTypes] = await Promise.all([
      prisma.projectStatus.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      prisma.taskStatus.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      prisma.taskPriority.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      prisma.taskType.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    ]);

    sendSuccess(res, {
      projectStatuses: projectStatuses.map((status) => ({
        id: status.id,
        key: status.key,
        name: status.name,
        category: status.category,
        color: status.color,
        isDefault: status.isDefault,
      })),
      taskStatuses: taskStatuses.map((status) => ({
        id: status.id,
        key: status.key,
        name: status.name,
        category: status.category,
        color: status.color,
        isDefault: status.isDefault,
      })),
      taskPriorities: taskPriorities.map((priority) => ({
        id: priority.id,
        key: priority.key,
        name: priority.name,
        weight: priority.weight,
        color: priority.color,
        isDefault: priority.isDefault,
      })),
      taskTypes: taskTypes.map((type) => ({
        id: type.id,
        key: type.key,
        name: type.name,
        icon: type.icon,
        color: type.color,
        isDefault: type.isDefault,
      })),
    });
  }),
);

export default router;
