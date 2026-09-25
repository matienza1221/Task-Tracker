import { z } from 'zod';

export const TASK_STATUS_CATEGORIES = [
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'REVIEW',
  'TESTING',
  'BLOCKED',
  'DONE',
  'CANCELLED',
] as const;

export const PROJECT_STATUS_CATEGORIES = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'] as const;

export const VOCABULARY_KINDS = [
  'task-statuses',
  'task-priorities',
  'task-types',
  'project-statuses',
] as const;

export const vocabularyParamSchema = z.object({
  kind: z.enum(VOCABULARY_KINDS),
  id: z.string().uuid('Invalid id.'),
});

export const vocabularyQuerySchema = z.object({
  hard: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default('false'),
});

const baseFields = {
  name: z.string().trim().min(1, 'Name is required.').max(60),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour such as #6366f1.')
    .optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
};

export const createVocabularySchema = z
  .object({
    ...baseFields,
    category: z.string().trim().max(40).optional(),
    weight: z.number().int().min(0).max(100).optional(),
    icon: z.string().trim().max(40).optional(),
  })
  .strict();

export const updateVocabularySchema = createVocabularySchema.partial().strict();

export type CreateVocabularyInput = z.infer<typeof createVocabularySchema>;
export type UpdateVocabularyInput = z.infer<typeof updateVocabularySchema>;
export type VocabularyKind = (typeof VOCABULARY_KINDS)[number];
