import { z } from 'zod';

export const PROJECT_ROLES = ['MANAGER', 'DEVELOPER', 'VIEWER'] as const;
export const MILESTONE_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format.')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'Invalid date.');

const booleanParam = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

export const projectIdParamSchema = z.object({ projectId: z.string().uuid('Invalid project id.') });

export const milestoneParamSchema = z.object({
  projectId: z.string().uuid('Invalid project id.'),
  milestoneId: z.string().uuid('Invalid milestone id.'),
});

export const labelParamSchema = z.object({
  projectId: z.string().uuid('Invalid project id.'),
  labelId: z.string().uuid('Invalid label id.'),
});

export const savedViewParamSchema = z.object({
  projectId: z.string().uuid('Invalid project id.'),
  viewId: z.string().uuid('Invalid saved view id.'),
});

export const memberParamSchema = z.object({
  projectId: z.string().uuid('Invalid project id.'),
  userId: z.string().uuid('Invalid user id.'),
});

export const listProjectsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  statusKey: z.string().trim().max(50).optional(),
  includeArchived: booleanParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const createProjectSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Code must start with a letter and contain 2–10 letters or digits.'),
    name: z.string().trim().min(2, 'Project name is required.').max(150),
    description: z.string().trim().max(5000).nullable().optional(),
    statusId: z.string().uuid('Invalid status.').optional(),
    priorityId: z.string().uuid('Invalid priority.').optional(),
    startDate: dateOnly.nullable().optional(),
    targetDate: dateOnly.nullable().optional(),
    managerId: z.string().uuid('Invalid manager.').nullable().optional(),
  })
  .strict()
  .refine(
    (value) => !value.startDate || !value.targetDate || value.targetDate >= value.startDate,
    { path: ['targetDate'], message: 'Target date cannot be before the start date.' },
  );

/** Code is immutable after creation: task keys are derived from it. */
export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(2).max(150).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    statusId: z.string().uuid('Invalid status.').optional(),
    priorityId: z.string().uuid('Invalid priority.').optional(),
    startDate: dateOnly.nullable().optional(),
    targetDate: dateOnly.nullable().optional(),
    managerId: z.string().uuid('Invalid manager.').nullable().optional(),
    progressWeighting: z.enum(['COUNT', 'HOURS']).optional(),
  })
  .strict();

export const addMemberSchema = z
  .object({
    userId: z.string().uuid('Invalid user id.'),
    projectRole: z.enum(PROJECT_ROLES),
  })
  .strict();

export const updateMemberSchema = z.object({ projectRole: z.enum(PROJECT_ROLES) }).strict();

export const createMilestoneSchema = z
  .object({
    name: z.string().trim().min(2, 'Milestone name is required.').max(150),
    description: z.string().trim().max(2000).nullable().optional(),
    targetDate: dateOnly.nullable().optional(),
    status: z.enum(MILESTONE_STATUSES).optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export const updateMilestoneSchema = createMilestoneSchema.partial().strict();

export const createLabelSchema = z
  .object({
    name: z.string().trim().min(1, 'Label name is required.').max(50),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour such as #6366f1.')
      .default('#6366f1'),
  })
  .strict();

export const updateLabelSchema = createLabelSchema.partial().strict();

export const createSavedViewSchema = z
  .object({
    name: z.string().trim().min(2, 'View name is required.').max(80),
    filters: z.record(z.unknown()),
    isDefault: z.boolean().optional(),
  })
  .strict()
  .refine((value) => JSON.stringify(value.filters).length <= 10_000, {
    path: ['filters'],
    message: 'Filters payload is too large.',
  });

export const updateSavedViewSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    filters: z.record(z.unknown()).optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const listActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const deleteProjectQuerySchema = z.object({
  purge: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default('false'),
});

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;
export type CreateLabelInput = z.infer<typeof createLabelSchema>;
export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;
export type CreateSavedViewInput = z.infer<typeof createSavedViewSchema>;
export type UpdateSavedViewInput = z.infer<typeof updateSavedViewSchema>;
