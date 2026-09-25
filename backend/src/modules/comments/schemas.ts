import { z } from 'zod';

export const commentIdParamSchema = z.object({ commentId: z.string().uuid('Invalid comment id.') });

export const createCommentSchema = z
  .object({
    body: z.string().trim().min(1, 'A comment cannot be empty.').max(10_000, 'Comments are limited to 10,000 characters.'),
    /** Mentioned users are sent explicitly so parsing can never mis-resolve a name. */
    mentionedUserIds: z.array(z.string().uuid()).max(20).optional(),
  })
  .strict();

export const updateCommentSchema = z
  .object({ body: z.string().trim().min(1, 'A comment cannot be empty.').max(10_000) })
  .strict();

export const listCommentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
