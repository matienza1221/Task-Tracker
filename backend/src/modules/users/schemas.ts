import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../lib/password';

export const GLOBAL_ROLES = ['ADMIN', 'PROJECT_MANAGER', 'DEVELOPER', 'VIEWER'] as const;
export const globalRoleSchema = z.enum(GLOBAL_ROLES);

export const userIdParamSchema = z.object({
  userId: z.string().uuid('Invalid user id.'),
});

export const listUsersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  role: globalRoleSchema.optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const lookupUsersQuerySchema = z.object({
  search: z.string().trim().min(2, 'Search requires at least 2 characters.').max(120),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export const createUserSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254),
    displayName: z.string().trim().min(2, 'Display name is required.').max(120),
    globalRole: globalRoleSchema.default('VIEWER'),
    timezone: z.string().trim().min(1).max(64).optional(),
    // Optional: when omitted, a strong temporary password is generated and
    // returned once so an administrator can hand it to the user securely.
    password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH).optional(),
  })
  .strict();

export const updateUserSchema = z
  .object({
    displayName: z.string().trim().min(2).max(120).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    avatarUrl: z.string().trim().url('Enter a valid URL.').max(500).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const changeRoleSchema = z.object({ globalRole: globalRoleSchema }).strict();

export const deleteUserQuerySchema = z.object({
  purge: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default('false'),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type LookupUsersQuery = z.infer<typeof lookupUsersQuerySchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type GlobalRoleInput = z.infer<typeof globalRoleSchema>;
