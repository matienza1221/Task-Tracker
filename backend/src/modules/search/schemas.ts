import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Search for at least two characters.').max(120),
  limit: z.coerce.number().int().min(1).max(20).default(6),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
