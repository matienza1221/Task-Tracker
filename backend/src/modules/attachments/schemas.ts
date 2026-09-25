import { z } from 'zod';

export const attachmentIdParamSchema = z.object({ attachmentId: z.string().uuid('Invalid attachment id.') });

export const taskIdParamSchema = z.object({ taskId: z.string().uuid('Invalid task id.') });

export const listAttachmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
