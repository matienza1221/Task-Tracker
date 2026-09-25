import { z } from 'zod';
import { dateOnly } from '../../lib/validation';

export const importIdParamSchema = z.object({ jobId: z.string().uuid('Invalid import id.') });

/** Target fields an administrator can map spreadsheet columns onto. */
export const IMPORT_FIELDS = [
  'title',
  'description',
  'area',
  'assignee',
  'priority',
  'status',
  'type',
  'milestone',
  'startDate',
  'dueDate',
  'completedDate',
  'estimatedHours',
  'actualHours',
  'nextStep',
  'verificationNote',
  'codeReferences',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Header synonyms used to auto-detect the header row and suggest mappings. */
export const HEADER_SYNONYMS: Record<ImportField, string[]> = {
  title: ['task', 'title', 'name', 'summary', 'item'],
  description: ['description', 'details', 'notes'],
  area: ['area', 'category', 'component', 'module', 'tag'],
  assignee: ['owner', 'assignee', 'assigned to', 'developer', 'responsible'],
  priority: ['priority', 'importance'],
  status: ['status', 'state', 'progress'],
  type: ['type', 'kind', 'work type'],
  milestone: ['milestone', 'release', 'sprint'],
  startDate: ['start', 'start date', 'started'],
  dueDate: ['due', 'due date', 'deadline', 'target date'],
  completedDate: ['completed', 'completed date', 'done date', 'finished'],
  estimatedHours: ['estimate', 'estimated hours', 'estimate (h)', 'hours'],
  actualHours: ['actual', 'actual hours', 'spent', 'logged'],
  nextStep: ['blocker', 'next step', 'blocker / next step', 'notes / blocker'],
  verificationNote: ['verification', 'verified', 'verification note'],
  codeReferences: ['reference link', 'reference', 'code reference', 'code', 'files', 'file'],
};

/** Counts how many cells of a row look like known column headers. */
export function scoreHeaderRow(row: string[]): number {
  const known = new Set(Object.values(HEADER_SYNONYMS).flat());
  return row.filter((cell) => known.has(cell.trim().toLowerCase())).length;
}

export const mappingSchema = z.record(z.enum(IMPORT_FIELDS), z.string().min(1).max(120));

export const previewSchema = z
  .object({
    projectId: z.string().uuid('Choose a target project.'),
    mapping: mappingSchema,
    defaults: z
      .object({
        assigneeId: z.string().uuid().nullable().optional(),
        statusKey: z.string().max(50).optional(),
        priorityKey: z.string().max(50).optional(),
        typeKey: z.string().max(50).optional(),
        milestoneId: z.string().uuid().nullable().optional(),
        dueDate: dateOnly.optional(),
      })
      .strict()
      .optional(),
    /** When true, rows whose title already exists in the project are skipped. */
    skipDuplicates: z.boolean().default(true),
  })
  .strict();

export const commitSchema = previewSchema;

export const listImportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const importRowsQuerySchema = z.object({
  status: z.enum(['PENDING', 'VALID', 'INVALID', 'IMPORTED', 'SKIPPED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type PreviewInput = z.infer<typeof previewSchema>;
