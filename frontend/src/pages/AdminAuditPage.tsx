import { useState } from 'react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Pagination } from '../components/ui/Pagination';
import { Select } from '../components/ui/Select';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { ShieldIcon } from '../components/ui/icons';
import { auditExportUrl, useAuditActions, useAuditLogs, type AuditFilters } from '../features/audit/queries';
import { formatDateTime, formatRelative } from '../lib/format';
import { cn } from '../lib/cn';

const TONES: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'indigo'> = {
  LOGIN: 'success',
  LOGOUT: 'neutral',
  LOGIN_FAILED: 'warning',
  ACCOUNT_LOCKED: 'danger',
  PASSWORD_CHANGED: 'info',
  USER_CREATED: 'indigo',
  USER_DELETED: 'danger',
  USER_ROLE_CHANGED: 'warning',
  PROJECT_DELETED: 'danger',
  TASK_DELETED: 'danger',
  ATTACHMENT_UPLOADED: 'info',
  VOCABULARY_CHANGED: 'warning',
};

function toneFor(action: string) {
  if (TONES[action]) return TONES[action];
  if (action.includes('DELETED')) return 'danger';
  if (action.includes('FAILED') || action.includes('LOCKED')) return 'warning';
  if (action.includes('CREATED')) return 'success';
  return 'neutral';
}

/** Administrator audit trail: filters, pagination and CSV export. */
export function AdminAuditPage() {
  const [filters, setFilters] = useState<AuditFilters>({ page: 1, pageSize: 25 });
  const [actorEmailDraft, setActorEmailDraft] = useState('');
  const logs = useAuditLogs(filters);
  const actions = useAuditActions();

  const rows = logs.data?.data.auditLogs ?? [];
  const total = Number(logs.data?.meta.total ?? rows.length);
  const totalPages = Number(logs.data?.meta.totalPages ?? 1);

  const update = (partial: Partial<AuditFilters>) =>
    setFilters((current) => ({ ...current, ...partial, page: partial.page ?? 1 }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-white">
            <ShieldIcon className="text-lg text-indigo-500" />
            Audit log
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {total} recorded event{total === 1 ? '' : 's'} · append-only, administrator access only
          </p>
        </div>
        <a
          href={auditExportUrl(filters)}
          className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          download
        >
          Export CSV
        </a>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="w-56">
          <Select
            label="Action"
            placeholder="All actions"
            options={(actions.data?.actions ?? []).map((action) => ({ value: action, label: action }))}
            value={filters.action ?? ''}
            onChange={(event) => update({ action: event.target.value || undefined })}
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <Input
            label="Actor email"
            placeholder="admin@example.com"
            value={actorEmailDraft}
            onChange={(event) => setActorEmailDraft(event.target.value)}
            onBlur={() => update({ actorEmail: actorEmailDraft || undefined })}
          />
        </div>
        <div className="w-44">
          <Select
            label="Resource"
            placeholder="Any resource"
            options={[
              { value: 'project', label: 'Project' },
              { value: 'task', label: 'Task' },
              { value: 'user', label: 'User' },
              { value: 'milestone', label: 'Milestone' },
              { value: 'label', label: 'Label' },
              { value: 'comment', label: 'Comment' },
              { value: 'attachment', label: 'Attachment' },
              { value: 'saved_view', label: 'Saved view' },
              { value: 'settings', label: 'Settings' },
            ]}
            value={filters.resourceType ?? ''}
            onChange={(event) => update({ resourceType: event.target.value || undefined })}
          />
        </div>
        <div className="w-40">
          <Input
            label="From"
            type="date"
            value={filters.from ?? ''}
            onChange={(event) => update({ from: event.target.value || undefined })}
          />
        </div>
        <div className="w-40">
          <Input
            label="To"
            type="date"
            value={filters.to ?? ''}
            onChange={(event) => update({ to: event.target.value || undefined })}
          />
        </div>
        <Button
          variant="ghost"
          className="mb-0.5"
          onClick={() => {
            setActorEmailDraft('');
            setFilters({ page: 1, pageSize: 25 });
          }}
        >
          Clear
        </Button>
      </div>

      <Card>
        <CardHeader title="Events" description="Newest first" />
        {logs.isLoading && (
          <CardBody className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-3/4" />
          </CardBody>
        )}
        {logs.isError && (
          <CardBody>
            <ErrorState title="Could not load the audit log" description={logs.error.message} onRetry={() => logs.refetch()} />
          </CardBody>
        )}
        {!logs.isLoading && !logs.isError && rows.length === 0 && (
          <CardBody>
            <EmptyState title="No matching events" description="Adjust the filters to widen the search." />
          </CardBody>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                  <th scope="col" className="px-5 py-2.5 font-medium">When</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Action</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Actor</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Resource</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Metadata</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3 text-xs whitespace-nowrap text-slate-500 dark:text-slate-400" title={formatDateTime(row.createdAt)}>
                      {formatRelative(row.createdAt)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={toneFor(row.action)}>{row.action}</Badge>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-600 dark:text-slate-300">
                      {row.actor.email ?? <span className="italic text-slate-400">system</span>}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {row.resourceType ? (
                        <span>
                          {row.resourceType}
                          {row.resourceId && <span className="ml-1 font-mono text-[10px] text-slate-400">{row.resourceId.slice(0, 8)}</span>}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="max-w-[280px] px-5 py-3">
                      {row.metadata ? (
                        <code
                          className={cn(
                            'block truncate font-mono text-[10px] text-slate-500 dark:text-slate-400',
                          )}
                          title={JSON.stringify(row.metadata)}
                        >
                          {JSON.stringify(row.metadata)}
                        </code>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs whitespace-nowrap text-slate-500 dark:text-slate-400">{row.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <CardBody className="border-t border-slate-100 dark:border-slate-800">
          <Pagination
            page={filters.page ?? 1}
            totalPages={totalPages}
            total={total}
            onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
          />
        </CardBody>
      </Card>
    </div>
  );
}
