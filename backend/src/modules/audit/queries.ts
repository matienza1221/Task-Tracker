import type { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { parseDateOnly } from '../../lib/validation';

export interface AuditLogFilters {
  action?: AuditAction;
  actorEmail?: string;
  resourceType?: string;
  resourceId?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export interface AuditLogDto {
  id: string;
  action: string;
  actor: { id: string | null; email: string | null };
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

function buildWhere(filters: AuditLogFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (filters.action) where.action = filters.action;
  if (filters.actorEmail) where.actorEmail = { contains: filters.actorEmail, mode: 'insensitive' };
  if (filters.resourceType) where.resourceType = filters.resourceType;
  if (filters.resourceId) where.resourceId = filters.resourceId;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: parseDateOnly(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(parseDateOnly(filters.to).getTime() + 86_400_000 - 1) } : {}),
    };
  }
  return where;
}

function toDto(row: {
  id: string;
  action: string;
  actorUserId: string | null;
  actorEmail: string | null;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Prisma.JsonValue | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}): AuditLogDto {
  return {
    id: row.id,
    action: row.action,
    actor: { id: row.actorUserId, email: row.actorEmail },
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    ip: row.ip,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAuditLogs(
  filters: AuditLogFilters,
): Promise<{ items: AuditLogDto[]; total: number }> {
  const where = buildWhere(filters);
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items: rows.map(toDto), total };
}

const CSV_CAP = 10_000;

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Exports the filtered audit trail as CSV (capped, newest first). */
export async function exportAuditLogsCsv(filters: AuditLogFilters): Promise<string> {
  const rows = await prisma.auditLog.findMany({
    where: buildWhere(filters),
    orderBy: { createdAt: 'desc' },
    take: CSV_CAP,
  });

  const header = ['timestamp', 'action', 'actor_email', 'actor_id', 'resource_type', 'resource_id', 'ip', 'user_agent', 'metadata'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.createdAt.toISOString(),
        row.action,
        row.actorEmail,
        row.actorUserId,
        row.resourceType,
        row.resourceId,
        row.ip,
        row.userAgent,
        row.metadata ? JSON.stringify(row.metadata) : '',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

export async function auditLogActions(): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } });
  return rows.map((row) => row.action);
}
