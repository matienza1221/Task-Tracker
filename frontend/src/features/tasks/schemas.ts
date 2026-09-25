import { z } from 'zod';

const optionalDate = z
  .string()
  .optional()
  .refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Use the YYYY-MM-DD format.');

const optionalHours = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : Number(value)),
  z.number().min(0, 'Hours cannot be negative.').max(9999.99).optional(),
);

const optionalPercent = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? undefined : Number(value)),
  z.number().int().min(0).max(100).optional(),
);

export const taskFormSchema = z
  .object({
    title: z.string().trim().min(2, 'Task title is required.').max(200),
    description: z.string().trim().max(20_000).optional(),
    statusId: z.string().optional(),
    priorityId: z.string().optional(),
    typeId: z.string().optional(),
    assigneeId: z.string().nullable().optional(),
    milestoneId: z.string().nullable().optional(),
    startDate: optionalDate,
    dueDate: optionalDate,
    estimatedHours: optionalHours,
    actualHours: optionalHours,
    progress: optionalPercent,
    nextStep: z.string().trim().max(2000).optional(),
    verificationNote: z.string().trim().max(2000).optional(),
    codeReferencesText: z.string().max(10_000).optional(),
    labelIds: z.array(z.string()).max(20).optional(),
  })
  .refine((values) => !values.startDate || !values.dueDate || values.dueDate >= values.startDate, {
    path: ['dueDate'],
    message: 'Due date cannot be before the start date.',
  });

export type TaskFormValues = z.infer<typeof taskFormSchema>;

export const subtaskFormSchema = z.object({
  title: z.string().trim().min(2, 'Subtask title is required.').max(200),
});

export type SubtaskFormValues = z.infer<typeof subtaskFormSchema>;

export const inlineProgressSchema = z.object({
  progress: z.number().int().min(0).max(100),
});

/** Splits the code-reference textarea into the string array the API expects. */
export function parseCodeReferences(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50);
}
