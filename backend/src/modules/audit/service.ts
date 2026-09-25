import type { Request } from 'express';
import type { AuditAction, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { logger } from '../../lib/logger';

export interface AuditInput {
  action: AuditAction;
  actorUserId?: string | null;
  actorEmail?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditContext {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Append-only audit trail. Failures are logged but never break the caller's
 * request — losing an audit row must not take the API down, but it must be
 * visible in the logs.
 */
export async function recordAudit(input: AuditInput, context: AuditContext = {}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        actorUserId: input.actorUserId ?? null,
        actorEmail: input.actorEmail?.toLowerCase() ?? null,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
  } catch (error) {
    logger.error({ err: error, action: input.action }, 'Failed to write audit log');
  }
}

export function auditContextFromRequest(req: Request): AuditContext {
  return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null };
}
