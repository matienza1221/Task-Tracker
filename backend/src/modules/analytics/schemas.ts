import { z } from 'zod';

export const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(180).default(30),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
