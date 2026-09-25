import { z } from 'zod';
import { booleanParam, dateOnly, stringArrayParam } from '../../lib/validation';

export const calendarQuerySchema = z
  .object({
    from: dateOnly,
    to: dateOnly,
    projectId: z.string().uuid().optional(),
    assignee: stringArrayParam(),
    label: stringArrayParam(),
    milestone: stringArrayParam(),
    status: stringArrayParam(),
    includeCompleted: booleanParam,
    scope: z.enum(['all', 'mine']).default('all'),
  })
  .refine((value) => value.to >= value.from, {
    path: ['to'],
    message: 'The end of the range must not be before its start.',
  });

export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
