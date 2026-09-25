import { z } from 'zod';
import { GLOBAL_ROLES } from './constants';

export const createUserFormSchema = z.object({
  email: z.string().min(1, 'Email is required.').email('Enter a valid email address.'),
  displayName: z.string().trim().min(2, 'Display name is required.').max(120),
  globalRole: z.enum(GLOBAL_ROLES),
  password: z
    .string()
    .optional()
    .refine((value) => !value || value.length >= 12, 'Password must be at least 12 characters long.'),
});

export type CreateUserFormValues = z.infer<typeof createUserFormSchema>;

export const updateUserFormSchema = z.object({
  displayName: z.string().trim().min(2, 'Display name is required.').max(120),
  timezone: z.string().trim().min(1, 'Timezone is required.').max(64),
});

export type UpdateUserFormValues = z.infer<typeof updateUserFormSchema>;
