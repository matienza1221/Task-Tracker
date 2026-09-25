import { z } from 'zod';

/** `YYYY-MM-DD` date-only string, stored as a UTC midnight date column. */
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format.')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'Invalid date.');

export const booleanParam = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

/**
 * Accepts repeated query parameters (`?status=A&status=B`) and comma-separated
 * values (`?status=A,B`), always producing a string array.
 */
export function stringArrayParam() {
  return z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === '') return undefined;
      const list = Array.isArray(value) ? value : [value];
      return list
        .flatMap((item) => String(item).split(','))
        .map((item) => item.trim())
        .filter(Boolean);
    },
    z.array(z.string().max(200)).max(50).optional(),
  );
}

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
