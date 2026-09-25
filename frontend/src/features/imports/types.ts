export type ImportField =
  | 'title'
  | 'description'
  | 'area'
  | 'assignee'
  | 'priority'
  | 'status'
  | 'type'
  | 'milestone'
  | 'startDate'
  | 'dueDate'
  | 'completedDate'
  | 'estimatedHours'
  | 'actualHours'
  | 'nextStep'
  | 'verificationNote'
  | 'codeReferences';

export interface ImportSummary {
  headers: string[];
  rowCount: number;
  valid: number;
  invalid: number;
  duplicates: number;
  imported?: number;
  skipped?: number;
  labelsToCreate?: string[];
  labelsCreated?: number;
  taskKeys?: string[];
  warnings?: string[];
}

export interface ImportRowPreview {
  rowNumber: number;
  status: 'VALID' | 'INVALID' | 'SKIPPED' | 'IMPORTED' | 'PENDING';
  errors: { path: string; message: string }[];
  normalized: Record<string, unknown> | null;
  raw: Record<string, string>;
}

export interface ImportJobInfo {
  id: string;
  filename: string;
  sourceFormat: string;
  status: string;
  projectId: string | null;
  mapping: Record<string, string> | null;
  summary: ImportSummary | null;
  createdAt: string;
  committedAt: string | null;
}

export interface ImportUploadResult {
  job: ImportJobInfo;
  headers: string[];
  sampleRows: string[][];
  rowCount: number;
  /** 1-based line number where the header row was detected. */
  headerRowNumber: number;
  /** Title/KPI rows above the header that were ignored. */
  preambleRows: number;
}

export interface ImportPreviewResult {
  summary: ImportSummary;
  preview: ImportRowPreview[];
  errors: ImportRowPreview[];
}

export interface ImportCommitResult {
  summary: ImportSummary;
  alreadyCommitted: boolean;
}

export interface ImportRequestInput {
  projectId: string;
  mapping: Record<string, string>;
  skipDuplicates: boolean;
  defaults?: {
    assigneeId?: string | null;
    statusKey?: string;
    priorityKey?: string;
    typeKey?: string;
  };
}

/** Human labels for the target fields shown in the mapping step. */
export const IMPORT_FIELD_LABELS: Record<ImportField, { label: string; hint?: string; required?: boolean }> = {
  title: { label: 'Task title', required: true },
  description: { label: 'Description' },
  area: { label: 'Area / label', hint: 'Creates project labels when missing' },
  assignee: { label: 'Assignee', hint: 'Matched by project member name or email' },
  priority: { label: 'Priority' },
  status: { label: 'Status' },
  type: { label: 'Task type' },
  milestone: { label: 'Milestone' },
  startDate: { label: 'Start date' },
  dueDate: { label: 'Due date' },
  completedDate: { label: 'Completed date' },
  estimatedHours: { label: 'Estimated hours' },
  actualHours: { label: 'Actual hours' },
  nextStep: { label: 'Blocker / next step' },
  verificationNote: { label: 'Verification note' },
  codeReferences: { label: 'Code references', hint: 'Split on “;”' },
};

export const IMPORT_FIELDS = Object.keys(IMPORT_FIELD_LABELS) as ImportField[];

const SYNONYMS: Record<ImportField, string[]> = {
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

/** Suggests a column for each target field from the uploaded header row. */
export function suggestMapping(headers: string[]): Partial<Record<ImportField, string>> {
  const normalized = headers.map((header) => ({ header, key: header.trim().toLowerCase() }));
  const mapping: Partial<Record<ImportField, string>> = {};
  const used = new Set<string>();

  for (const field of IMPORT_FIELDS) {
    const candidates = [field.toLowerCase(), ...SYNONYMS[field]];
    const exact = normalized.find((entry) => !used.has(entry.header) && candidates.includes(entry.key));
    const partial =
      exact ?? normalized.find((entry) => !used.has(entry.header) && candidates.some((candidate) => entry.key.includes(candidate)));
    if (partial) {
      mapping[field] = partial.header;
      used.add(partial.header);
    }
  }
  return mapping;
}
