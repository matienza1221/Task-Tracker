import { z } from 'zod';
import { MILESTONE_STATUSES, PROJECT_ROLES } from '../users/constants';

const optionalDate = z
  .string()
  .optional()
  .refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Use the YYYY-MM-DD format.');

export const projectFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Code must start with a letter and contain 2–10 letters or digits.'),
    name: z.string().trim().min(2, 'Project name is required.').max(150),
    description: z.string().trim().max(5000).optional(),
    statusId: z.string().optional(),
    priorityId: z.string().optional(),
    startDate: optionalDate,
    targetDate: optionalDate,
    managerId: z.string().optional(),
  })
  .refine((values) => !values.startDate || !values.targetDate || values.targetDate >= values.startDate, {
    path: ['targetDate'],
    message: 'Target date cannot be before the start date.',
  });

export type ProjectFormValues = z.infer<typeof projectFormSchema>;

export const milestoneFormSchema = z.object({
  name: z.string().trim().min(2, 'Milestone name is required.').max(150),
  description: z.string().trim().max(2000).optional(),
  targetDate: optionalDate,
  status: z.enum(MILESTONE_STATUSES),
});

export type MilestoneFormValues = z.infer<typeof milestoneFormSchema>;

export const labelFormSchema = z.object({
  name: z.string().trim().min(1, 'Label name is required.').max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a colour.'),
});

export type LabelFormValues = z.infer<typeof labelFormSchema>;

export const addMemberFormSchema = z.object({
  userId: z.string().uuid('Select a user.'),
  projectRole: z.enum(PROJECT_ROLES),
});

export type AddMemberFormValues = z.infer<typeof addMemberFormSchema>;
