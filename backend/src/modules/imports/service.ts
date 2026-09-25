import { createHash } from 'node:crypto';
import type { ImportJob, Prisma, User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { assertProjectPermission } from '../../lib/access';
import { conflict, notFound, validationError } from '../../lib/errors';
import { recalculateProjectProgress } from '../../lib/progress';
import { parseDateOnly } from '../../lib/validation';
import { recordActivity } from '../activity/service';
import { recordAudit } from '../audit/service';
import { parseSheet } from './parser';
import type { ImportField, PreviewInput } from './schemas';

export interface RowError {
  path: string;
  message: string;
}

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

type ImportRowWithData = {
  id: string;
  rowNumber: number;
  raw: Prisma.JsonValue;
  status: string;
  errors: Prisma.JsonValue | null;
  normalized: Prisma.JsonValue | null;
};

function hashRow(values: string[]): string {
  return createHash('sha256').update(values.map((value) => value.trim().toLowerCase()).join('|')).digest('hex');
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/**
 * Accepts ISO (`YYYY-MM-DD`), US (`M/D/YYYY`, the Google Sheets default) and
 * Excel serial numbers. Dates that roll over (e.g. `31/12/2026` or
 * `2026-02-30`) are rejected instead of silently becoming a different day.
 */
export function parseImportDate(value: string): Date | null {
  const text = value.trim();
  if (!text) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) {
    const [, year, month, day] = iso;
    return buildDate(Number(year), Number(month), Number(day));
  }

  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (us) {
    const [, month, day, year] = us;
    return buildDate(Number(year), Number(month), Number(day));
  }

  if (/^\d{5}$/.test(text)) {
    const serial = Number(text);
    if (serial > 20000 && serial < 60000) return new Date(EXCEL_EPOCH + serial * 86_400_000);
  }

  return null;
}

/** Builds a UTC date only when the components are real (no rollover). */
function buildDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function parseNumber(value: string): number | null {
  const text = value.replace(/[,\s]/g, '');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Splits the spreadsheet's `file:line; file:line` reference cells and drops
 * placeholder values ("-", "n/a") that carry no information.
 */
export function parseCodeReferences(value: string): string[] {
  return value
    .split(/[;\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !/^(-|n\/a|none|nil)$/i.test(entry))
    .slice(0, 50);
}

/** Cells that mean "nothing to do here" rather than a real note. */
const VERIFICATION_ONLY = /^(verified|done|ok|checked|confirmed|-)$/i;

async function loadResolvers(projectId: string) {
  const [statuses, priorities, types, labels, milestones, members, existingTitles] = await Promise.all([
    prisma.taskStatus.findMany({ select: { id: true, key: true, name: true, category: true } }),
    prisma.taskPriority.findMany({ select: { id: true, key: true, name: true } }),
    prisma.taskType.findMany({ select: { id: true, key: true, name: true } }),
    prisma.label.findMany({ where: { deletedAt: null, OR: [{ projectId }, { projectId: null }] }, select: { id: true, name: true, projectId: true } }),
    prisma.milestone.findMany({ where: { projectId, deletedAt: null }, select: { id: true, name: true } }),
    prisma.projectMember.findMany({
      where: { projectId },
      select: { user: { select: { id: true, email: true, displayName: true, deletedAt: true } } },
    }),
    prisma.task.findMany({ where: { projectId, deletedAt: null }, select: { title: true } }),
  ]);

  const byName = <T extends { name: string }>(rows: T[]) =>
    new Map(rows.map((row) => [row.name.trim().toLowerCase(), row]));

  return {
    statuses: new Map([...byName(statuses), ...statuses.map((row) => [row.key.toLowerCase(), row] as const)]),
    priorities: new Map([...byName(priorities), ...priorities.map((row) => [row.key.toLowerCase(), row] as const)]),
    types: new Map([...byName(types), ...types.map((row) => [row.key.toLowerCase(), row] as const)]),
    labels: new Map(labels.map((label) => [label.name.trim().toLowerCase(), label])),
    milestones: byName(milestones),
    members: new Map(
      members
        .filter((member) => member.user.deletedAt === null)
        .flatMap((member) => [
          [member.user.email.trim().toLowerCase(), member.user] as const,
          [member.user.displayName.trim().toLowerCase(), member.user] as const,
        ]),
    ),
    existingTitles: new Set(existingTitles.map((task) => task.title.trim().toLowerCase())),
  };
}

export interface ValidatedRow {
  rowNumber: number;
  status: 'VALID' | 'INVALID' | 'SKIPPED';
  errors: RowError[];
  normalized: Record<string, unknown> | null;
  raw: Record<string, string>;
  /** SHA-256 of the mapped values — row identity for duplicate detection. */
  rowHash: string;
}

function readField(raw: Record<string, string>, mapping: Record<string, string>, field: ImportField): string {
  const column = mapping[field];
  if (!column) return '';
  return (raw[column] ?? '').trim();
}

/**
 * Maps, normalizes and validates every stored row. Shared by preview and commit
 * so what an administrator sees is exactly what gets written.
 */
export async function validateRows(
  job: ImportJob,
  rows: ImportRowWithData[],
  input: PreviewInput,
): Promise<{ rows: ValidatedRow[]; labelsToCreate: string[] }> {
  const resolvers = await loadResolvers(input.projectId);
  const defaults = input.defaults ?? {};
  const seenHashes = new Set<string>();
  const labelsToCreate = new Set<string>();
  const validated: ValidatedRow[] = [];

  for (const row of rows) {
    const raw = (row.raw ?? {}) as Record<string, string>;
    const errors: RowError[] = [];
    const mappedValues = Object.values(input.mapping).map((column) => raw[column] ?? '');
    const rowHash = hashRow(mappedValues);

    if (seenHashes.has(rowHash)) {
      validated.push({ rowNumber: row.rowNumber, status: 'SKIPPED', errors: [{ path: 'row', message: 'Duplicate row in this file.' }], normalized: null, raw, rowHash });
      continue;
    }
    seenHashes.add(rowHash);

    const title = readField(raw, input.mapping, 'title');
    if (title.length < 2) errors.push({ path: 'title', message: 'A task title is required (2+ characters).' });
    if (title.length > 200) errors.push({ path: 'title', message: 'Titles are limited to 200 characters.' });

    const statusName = readField(raw, input.mapping, 'status') || defaults.statusKey || '';
    const status = statusName ? resolvers.statuses.get(statusName.trim().toLowerCase()) : undefined;
    if (statusName && !status) errors.push({ path: 'status', message: `Unknown status “${statusName}”.` });

    const priorityName = readField(raw, input.mapping, 'priority') || defaults.priorityKey || '';
    const priority = priorityName ? resolvers.priorities.get(priorityName.trim().toLowerCase()) : undefined;
    if (priorityName && !priority) errors.push({ path: 'priority', message: `Unknown priority “${priorityName}”.` });

    const typeName = readField(raw, input.mapping, 'type') || defaults.typeKey || '';
    const type = typeName ? resolvers.types.get(typeName.trim().toLowerCase()) : undefined;
    if (typeName && !type) errors.push({ path: 'type', message: `Unknown task type “${typeName}”.` });

    const assigneeName = readField(raw, input.mapping, 'assignee');
    const assignee = assigneeName ? resolvers.members.get(assigneeName.trim().toLowerCase()) : undefined;
    if (assigneeName && !assignee) {
      errors.push({ path: 'assignee', message: `“${assigneeName}” is not a member of this project (add them first or leave the cell empty).` });
    }

    const milestoneName = readField(raw, input.mapping, 'milestone');
    const milestone = milestoneName ? resolvers.milestones.get(milestoneName.trim().toLowerCase()) : undefined;
    if (milestoneName && !milestone) errors.push({ path: 'milestone', message: `Unknown milestone “${milestoneName}”.` });

    const parseDateField = (field: ImportField): Date | null => {
      const value = readField(raw, input.mapping, field);
      if (!value) return null;
      const parsed = parseImportDate(value);
      if (!parsed) errors.push({ path: field, message: `Could not read “${value}” as a date (use YYYY-MM-DD or M/D/YYYY).` });
      return parsed;
    };
    const startDate = parseDateField('startDate');
    const dueDate = parseDateField('dueDate') ?? (defaults.dueDate ? parseDateOnly(defaults.dueDate) : null);
    const completedDate = parseDateField('completedDate');

    if (startDate && dueDate && dueDate < startDate) {
      errors.push({ path: 'dueDate', message: 'The due date is before the start date.' });
    }

    const parseHoursField = (field: ImportField): number | null => {
      const value = readField(raw, input.mapping, field);
      if (!value) return null;
      const parsed = parseNumber(value);
      if (parsed === null || parsed < 0) errors.push({ path: field, message: `“${value}” is not a valid number of hours.` });
      return parsed;
    };
    const estimatedHours = parseHoursField('estimatedHours');
    const actualHours = parseHoursField('actualHours');

    const area = readField(raw, input.mapping, 'area');
    if (area) {
      const normalizedArea = area.trim();
      if (!resolvers.labels.has(normalizedArea.toLowerCase()) && normalizedArea.length <= 50) labelsToCreate.add(normalizedArea);
      if (normalizedArea.length > 50) errors.push({ path: 'area', message: 'Label names are limited to 50 characters.' });
    }

    const isDuplicateTitle = input.skipDuplicates && resolvers.existingTitles.has(title.trim().toLowerCase());
    if (isDuplicateTitle && errors.length === 0) {
      validated.push({
        rowNumber: row.rowNumber,
        status: 'SKIPPED',
        errors: [{ path: 'title', message: 'A task with this title already exists in the project.' }],
        normalized: null,
        raw,
        rowHash,
      });
      continue;
    }

    if (errors.length > 0) {
      validated.push({ rowNumber: row.rowNumber, status: 'INVALID', errors, normalized: null, raw, rowHash });
      continue;
    }

    // The reference sheet mixes verification markers and blockers in one
    // column: "Verified"/"-" becomes a verification note, everything else a
    // next step. An explicitly mapped verification column always wins.
    let nextStep = readField(raw, input.mapping, 'nextStep') || null;
    let verificationNote = readField(raw, input.mapping, 'verificationNote') || null;
    if (nextStep && !verificationNote && VERIFICATION_ONLY.test(nextStep.trim())) {
      verificationNote = nextStep.trim();
      nextStep = null;
    }

    const done = status?.category === 'DONE';
    validated.push({
      rowNumber: row.rowNumber,
      status: 'VALID',
      errors: [],
      raw,
      rowHash,
      normalized: {
        title: title.trim(),
        description: readField(raw, input.mapping, 'description') || null,
        statusId: status?.id ?? null,
        priorityId: priority?.id ?? null,
        typeId: type?.id ?? null,
        assigneeId: assignee?.id ?? defaults.assigneeId ?? null,
        milestoneId: milestone?.id ?? defaults.milestoneId ?? null,
        startDate: startDate ? startDate.toISOString().slice(0, 10) : null,
        dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
        completedAt: completedDate ? completedDate.toISOString() : done ? new Date().toISOString() : null,
        estimatedHours,
        actualHours: actualHours ?? 0,
        progress: done ? 100 : 0,
        nextStep,
        verificationNote,
        codeReferences: parseCodeReferences(readField(raw, input.mapping, 'codeReferences')),
        areaLabel: area ? area.trim() : null,
      },
    });
  }

  void job;
  return { rows: validated, labelsToCreate: [...labelsToCreate] };
}

function summarize(rows: ValidatedRow[], headers: string[], extra: Partial<ImportSummary> = {}): ImportSummary {
  return {
    headers,
    rowCount: rows.length,
    valid: rows.filter((row) => row.status === 'VALID').length,
    invalid: rows.filter((row) => row.status === 'INVALID').length,
    duplicates: rows.filter((row) => row.status === 'SKIPPED').length,
    ...extra,
  };
}

async function loadJobRows(jobId: string): Promise<ImportRowWithData[]> {
  return prisma.importRow.findMany({
    where: { jobId },
    orderBy: { rowNumber: 'asc' },
    select: { id: true, rowNumber: true, raw: true, status: true, errors: true, normalized: true },
  });
}

async function persistRows(jobId: string, rows: ValidatedRow[]): Promise<void> {
  await prisma.$transaction([
    prisma.importRow.deleteMany({ where: { jobId } }),
    prisma.importRow.createMany({
      data: rows.map((row) => ({
        jobId,
        rowNumber: row.rowNumber,
        raw: row.raw as Prisma.InputJsonValue,
        normalized: (row.normalized ?? undefined) as Prisma.InputJsonValue | undefined,
        errors: row.errors.length > 0 ? (row.errors as unknown as Prisma.InputJsonValue) : undefined,
        rowHash: row.rowHash,
        status: row.status,
      })),
    }),
  ]);
}

function jobSummary(job: ImportJob): ImportSummary {
  return (job.summary ?? {}) as unknown as ImportSummary;
}

export async function createImportJob(user: User, file: { buffer: Buffer; originalname: string }) {
  const filename = file.originalname.replace(/[^\w.\- ]/g, '_').slice(0, 200) || 'import.csv';
  const sheet = await parseSheet(file.buffer, filename);
  if (sheet.headers.length === 0) throw validationError('The uploaded file is empty.');
  if (sheet.rows.length === 0) throw validationError('The file has a header row but no data rows.');

  const job = await prisma.importJob.create({
    data: {
      createdById: user.id,
      filename,
      sourceFormat: sheet.format,
      status: 'UPLOADED',
      summary: {
        headers: sheet.headers,
        rowCount: sheet.rows.length,
        headerRowNumber: sheet.headerRowNumber,
        preambleRows: sheet.preambleRows,
      } as Prisma.InputJsonValue,
    },
  });

  await persistRows(
    job.id,
    sheet.rows.map((row) => ({
      rowNumber: row.rowNumber,
      status: 'VALID' as const,
      errors: [],
      normalized: null,
      raw: Object.fromEntries(sheet.headers.map((header, column) => [header, row.values[column] ?? ''])),
      rowHash: hashRow(row.values),
    })),
  );

  await recordAudit({
    action: 'IMPORT_COMMITTED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'import',
    resourceId: job.id,
    metadata: { stage: 'uploaded', filename, rows: sheet.rows.length, format: sheet.format },
  });

  return {
    job: { id: job.id, filename: job.filename, sourceFormat: job.sourceFormat, status: job.status, createdAt: job.createdAt },
    headers: sheet.headers,
    sampleRows: sheet.rows.slice(0, 5).map((row) => row.values),
    rowCount: sheet.rows.length,
    headerRowNumber: sheet.headerRowNumber,
    preambleRows: sheet.preambleRows,
  };
}

export async function previewImport(user: User, jobId: string, input: PreviewInput) {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job) throw notFound('Import job not found.');
  if (job.status === 'COMMITTED') throw conflict('This import has already been committed.');

  await assertProjectPermission(user, input.projectId, 'project:view');
  const rows = await loadJobRows(jobId);
  const { rows: validated, labelsToCreate } = await validateRows(job, rows, input);

  await persistRows(jobId, validated);
  const summary = summarize(validated, jobSummary(job).headers ?? [], {
    labelsToCreate,
    warnings: validated
      .filter((row) => row.status === 'INVALID')
      .slice(0, 3)
      .map((row) => `Row ${row.rowNumber}: ${row.errors[0]?.message ?? 'invalid'}`),
  });

  await prisma.importJob.update({
    where: { id: jobId },
    data: {
      projectId: input.projectId,
      mapping: input.mapping as Prisma.InputJsonValue,
      status: 'VALIDATED',
      summary: summary as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    summary,
    preview: validated.slice(0, 50),
    errors: validated.filter((row) => row.status === 'INVALID').slice(0, 100),
  };
}

export async function commitImport(user: User, jobId: string, input: PreviewInput) {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job) throw notFound('Import job not found.');

  if (job.status === 'COMMITTED') {
    return { summary: jobSummary(job), alreadyCommitted: true };
  }

  const access = await assertProjectPermission(user, input.projectId, 'project:view');
  const project = access.project;
  const rows = await loadJobRows(jobId);
  const { rows: validated, labelsToCreate } = await validateRows(job, rows, input);
  const validRows = validated.filter((row) => row.status === 'VALID');

  const report = await prisma.$transaction(
    async (tx) => {
      // Create any missing labels referenced by the Area column.
      const existingLabels = await tx.label.findMany({
        where: { deletedAt: null, OR: [{ projectId: project.id }, { projectId: null }], name: { in: labelsToCreate } },
        select: { id: true, name: true },
      });
      const labelIdByName = new Map(existingLabels.map((label) => [label.name.trim().toLowerCase(), label.id]));
      let labelsCreated = 0;
      for (const name of labelsToCreate) {
        if (labelIdByName.has(name.toLowerCase())) continue;
        const label = await tx.label.create({ data: { projectId: project.id, name, createdById: user.id } });
        labelIdByName.set(name.toLowerCase(), label.id);
        labelsCreated += 1;
      }

      const [fallbackStatusId, fallbackPriorityId, fallbackTypeId] = await Promise.all([
        defaultStatusId(tx),
        defaultPriorityId(tx),
        defaultTypeId(tx),
      ]);

      const sequence = await tx.project.update({
        where: { id: project.id },
        data: { taskSequence: { increment: validRows.length } },
        select: { taskSequence: true, code: true },
      });
      const firstNumber = sequence.taskSequence - validRows.length + 1;

      const taskKeys: string[] = [];
      let index = 0;
      for (const row of validRows) {
        const data = row.normalized as Record<string, unknown>;
        const number = firstNumber + index;
        const key = `${sequence.code}-${number}`;
        const task = await tx.task.create({
          data: {
            projectId: project.id,
            number,
            key,
            title: String(data.title),
            description: (data.description as string | null) ?? null,
            statusId: (data.statusId as string | null) ?? fallbackStatusId,
            priorityId: (data.priorityId as string | null) ?? fallbackPriorityId,
            typeId: (data.typeId as string | null) ?? fallbackTypeId,
            assigneeId: (data.assigneeId as string | null) ?? null,
            reporterId: user.id,
            milestoneId: (data.milestoneId as string | null) ?? null,
            startDate: data.startDate ? parseDateOnly(String(data.startDate)) : null,
            dueDate: data.dueDate ? parseDateOnly(String(data.dueDate)) : null,
            completedAt: data.completedAt ? new Date(String(data.completedAt)) : null,
            estimatedHours: (data.estimatedHours as number | null) ?? null,
            actualHours: Number(data.actualHours ?? 0),
            progress: Number(data.progress ?? 0),
            nextStep: (data.nextStep as string | null) ?? null,
            verificationNote: (data.verificationNote as string | null) ?? null,
            codeReferences: (data.codeReferences as string[]) ?? [],
            sortOrder: index,
          },
          select: { id: true },
        });

        const area = data.areaLabel as string | null;
        const labelId = area ? labelIdByName.get(area.toLowerCase()) : undefined;
        if (labelId) {
          await tx.taskLabel.create({ data: { taskId: task.id, labelId } });
        }

        await tx.importRow.updateMany({
          where: { jobId, rowNumber: row.rowNumber },
          data: { status: 'IMPORTED', taskId: task.id },
        });

        taskKeys.push(key);
        index += 1;
      }

      const summary: ImportSummary = summarize(validated, jobSummary(job).headers ?? [], {
        imported: validRows.length,
        skipped: validated.filter((row) => row.status === 'SKIPPED').length,
        labelsCreated,
        taskKeys,
        labelsToCreate,
      });

      return summary;
    },
    { timeout: 120_000 },
  );

  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: 'COMMITTED', committedAt: new Date(), summary: report as unknown as Prisma.InputJsonValue },
  });

  await recordActivity({
    projectId: project.id,
    actor: user,
    action: 'IMPORT_COMMITTED',
    metadata: { jobId, filename: job.filename, imported: report.imported ?? 0 },
  });
  await recordAudit({
    action: 'IMPORT_COMMITTED',
    actorUserId: user.id,
    actorEmail: user.email,
    resourceType: 'import',
    resourceId: jobId,
    metadata: { projectId: project.id, filename: job.filename, imported: report.imported ?? 0, invalid: report.invalid },
  });

  await recalculateProjectProgress(project.id);

  return { summary: report, alreadyCommitted: false };
}

async function defaultStatusId(tx: Prisma.TransactionClient): Promise<string> {
  const status = await tx.taskStatus.findFirstOrThrow({
    where: { isActive: true },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
    select: { id: true },
  });
  return status.id;
}

async function defaultPriorityId(tx: Prisma.TransactionClient): Promise<string> {
  const priority = await tx.taskPriority.findFirstOrThrow({
    where: { isActive: true },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
    select: { id: true },
  });
  return priority.id;
}

async function defaultTypeId(tx: Prisma.TransactionClient): Promise<string> {
  const type = await tx.taskType.findFirstOrThrow({
    where: { isActive: true },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
    select: { id: true },
  });
  return type.id;
}

export async function getImportJob(jobId: string, options: { status?: string; page: number; pageSize: number }) {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job) throw notFound('Import job not found.');

  const where = { jobId, ...(options.status ? { status: options.status as never } : {}) };
  const [rows, total, grouped] = await Promise.all([
    prisma.importRow.findMany({
      where,
      orderBy: { rowNumber: 'asc' },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
      select: { rowNumber: true, status: true, errors: true, normalized: true, taskId: true },
    }),
    prisma.importRow.count({ where }),
    prisma.importRow.groupBy({ by: ['status'], where: { jobId }, _count: { _all: true } }),
  ]);

  return {
    job: {
      id: job.id,
      filename: job.filename,
      sourceFormat: job.sourceFormat,
      status: job.status,
      projectId: job.projectId,
      mapping: job.mapping,
      summary: job.summary,
      createdAt: job.createdAt.toISOString(),
      committedAt: job.committedAt?.toISOString() ?? null,
    },
    counts: Object.fromEntries(grouped.map((row) => [row.status, row._count._all])),
    rows,
    total,
  };
}

export async function listImportJobs(options: { page: number; pageSize: number }) {
  const [items, total] = await Promise.all([
    prisma.importJob.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
      select: {
        id: true,
        filename: true,
        sourceFormat: true,
        status: true,
        projectId: true,
        summary: true,
        createdAt: true,
        committedAt: true,
        createdBy: { select: { id: true, displayName: true } },
      },
    }),
    prisma.importJob.count(),
  ]);
  return { items, total };
}
