import { useQuery } from '@tanstack/react-query';
import { apiGet, apiGetEnvelope } from '../../lib/api/axios';
import { toQueryString } from '../../lib/api/queryString';

export interface AuditLogRow {
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

export interface AuditFilters {
  action?: string;
  actorEmail?: string;
  resourceType?: string;
  resourceId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export const auditExportUrl = (filters: AuditFilters) =>
  `/api/admin/audit-logs${toQueryString({ ...filters, format: 'csv', page: undefined, pageSize: undefined })}`;

export function useAuditLogs(filters: AuditFilters) {
  return useQuery({
    queryKey: ['admin', 'audit', filters] as const,
    queryFn: () => apiGetEnvelope<{ auditLogs: AuditLogRow[] }>(`/admin/audit-logs${toQueryString({ ...filters })}`),
    placeholderData: (previous) => previous,
  });
}

export function useAuditActions() {
  return useQuery({
    queryKey: ['admin', 'audit', 'actions'] as const,
    queryFn: () => apiGet<{ actions: string[] }>('/admin/audit-logs/actions'),
    staleTime: 5 * 60_000,
  });
}
