import { z } from 'zod';
import { booleanParam, dateOnly, stringArrayParam } from '../../lib/validation';

export const taskIdParamSchema = z.object({ taskId: z.string().uuid('Invalid task id.') });

const hours = z.number().min(0, 'Hours cannot be negative.').max(9999.99, 'Hours value is too large.');
const progressValue = z.number().int().min(0).max(100);
const labelIds = z.array(z.string().uuid()).max(20);
const codeReferences = z.array(z.string().trim().min(1).max(300)).max(50);

// Shared field set: optional here so PATCH can send any subset; the create
// schema below re-declares `title` as required.
const taskFields = {
  title: z.string().trim().min(2, 'Task title is required.').max(200).optional(),
  description: z.string().trim().max(20_000).nullable().optional(),
  statusId: z.string().uuid('Invalid status.').optional(),
  priorityId: z.string().uuid('Invalid priority.').optional(),
  typeId: z.string().uuid('Invalid type.').optional(),
  assigneeId: z.string().uuid('Invalid assignee.').nullable().optional(),
  milestoneId: z.string().uuid('Invalid milestone.').nullable().optional(),
  startDate: dateOnly.nullable().optional(),
  dueDate: dateOnly.nullable().optional(),
  estimatedHours: hours.nullable().optional(),
  actualHours: hours.optional(),
  progress: progressValue.optional(),
  nextStep: z.string().trim().max(2000).nullable().optional(),
  verificationNote: z.string().trim().max(2000).nullable().optional(),
  codeReferences: codeReferences.optional(),
  labelIds: labelIds.optional(),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
};

const dateOrder = (value: { startDate?: string | null; dueDate?: string | null }) =>
  !value.startDate || !value.dueDate || value.dueDate >= value.startDate;

export const createTaskSchema = z
  .object({
    ...taskFields,
    title: z.string().trim().min(2, 'Task title is required.').max(200),
    parentTaskId: z.string().uuid('Invalid parent task.').nullable().optional(),
  })
  .strict()
  .refine(dateOrder, { path: ['dueDate'], message: 'Due date cannot be before the start date.' });

/** `version` guards against lost updates (HTTP 409 on mismatch). */
export const updateTaskSchema = z
  .object({ ...taskFields, version: z.number().int().min(1) })
  .strict()
  .refine(dateOrder, { path: ['dueDate'], message: 'Due date cannot be before the start date.' });

export const updateTaskStatusSchema = z
  .object({ statusId: z.string().uuid('Invalid status.'), version: z.number().int().min(1) })
  .strict();

export const updateTaskAssigneeSchema = z
  .object({ assigneeId: z.string().uuid('Invalid assignee.').nullable(), version: z.number().int().min(1) })
  .strict();

export const createSubtaskSchema = z
  .object({ title: z.string().trim().min(2, 'Subtask title is required.').max(200) })
  .strict();

export const taskListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: stringArrayParam(),
  priority: stringArrayParam(),
  type: stringArrayParam(),
  assignee: stringArrayParam(),
  reporter: stringArrayParam(),
  label: stringArrayParam(),
  milestone: stringArrayParam(),
  parentTaskId: z.string().uuid().optional(),
  scope: z.enum(['all', 'mine', 'unassigned']).default('all'),
  subtasks: z.enum(['top', 'all', 'only']).default('all'),
  overdue: booleanParam,
  blocked: booleanParam,
  includeCompleted: booleanParam,
  dueFrom: dateOnly.optional(),
  dueTo: dateOnly.optional(),
  progressMin: z.coerce.number().int().min(0).max(100).optional(),
  progressMax: z.coerce.number().int().min(0).max(100).optional(),
  sort: z.string().trim().max(40).default('-updatedAt'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const moveTaskSchema = z
  .object({
    statusId: z.string().uuid('Invalid status.'),
    targetIndex: z.number().int().min(0).max(10_000),
    version: z.number().int().min(1),
  })
  .strict();

export const boardQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  priority: stringArrayParam(),
  assignee: stringArrayParam(),
  label: stringArrayParam(),
  milestone: stringArrayParam(),
  scope: z.enum(['all', 'mine', 'unassigned']).default('all'),
  blocked: booleanParam,
  includeCancelled: booleanParam,
});

export const BULK_ACTIONS = ['set-status', 'set-priority', 'set-assignee', 'delete'] as const;

export const bulkTaskSchema = z
  .object({
    taskIds: z.array(z.string().uuid()).min(1, 'Select at least one task.').max(50, 'Select at most 50 tasks.'),
    action: z.enum(BULK_ACTIONS),
    statusId: z.string().uuid().optional(),
    priorityId: z.string().uuid().optional(),
    assigneeId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((value) => value.action !== 'set-status' || Boolean(value.statusId), {
    path: ['statusId'],
    message: 'Choose a status for this action.',
  })
  .refine((value) => value.action !== 'set-priority' || Boolean(value.priorityId), {
    path: ['priorityId'],
    message: 'Choose a priority for this action.',
  })
  .refine((value) => value.action !== 'set-assignee' || value.assigneeId !== undefined, {
    path: ['assigneeId'],
    message: 'Choose an assignee (or null to unassign).',
  });

export const taskActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
export type BoardQuery = z.infer<typeof boardQuerySchema>;
export type BulkTaskInput = z.infer<typeof bulkTaskSchema>;
