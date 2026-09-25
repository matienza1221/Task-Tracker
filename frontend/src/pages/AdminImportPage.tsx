import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { EmptyState } from '../components/ui/States';
import { UploadIcon } from '../components/ui/upload-icon';
import { useMembers, useProjects } from '../features/projects/queries';
import { useCommitImport, useImportJobs, usePreviewImport, useUploadImport } from '../features/imports/queries';
import {
  IMPORT_FIELDS,
  IMPORT_FIELD_LABELS,
  suggestMapping,
  type ImportCommitResult,
  type ImportField,
  type ImportPreviewResult,
  type ImportUploadResult,
} from '../features/imports/types';
import { cn } from '../lib/cn';
import { formatDateTime, formatRelative } from '../lib/format';
import { toast } from '../stores/toastStore';

type Step = 'upload' | 'map' | 'preview' | 'done';

const STATUS_TONES: Record<string, 'success' | 'danger' | 'warning' | 'neutral' | 'info'> = {
  VALID: 'success',
  INVALID: 'danger',
  SKIPPED: 'warning',
  IMPORTED: 'success',
  PENDING: 'neutral',
};

/**
 * Spreadsheet migration wizard: upload → map columns → preview/validate →
 * commit. Nothing is written until the commit step, and re-running a file is
 * idempotent because rows are keyed by a hash of their mapped values.
 */
export function AdminImportPage() {
  const [step, setStep] = useState<Step>('upload');
  const [upload, setUpload] = useState<ImportUploadResult | null>(null);
  const [projectId, setProjectId] = useState('');
  const [mapping, setMapping] = useState<Partial<Record<ImportField, string>>>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [defaultAssigneeId, setDefaultAssigneeId] = useState('');
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [report, setReport] = useState<ImportCommitResult | null>(null);

  const projects = useProjects({ pageSize: 100 });
  const members = useMembers(projectId, Boolean(projectId));
  const uploadImport = useUploadImport();
  const previewImport = usePreviewImport();
  const commitImport = useCommitImport();
  const jobs = useImportJobs();

  const headerOptions = useMemo(
    () => (upload?.headers ?? []).map((header) => ({ value: header, label: header })),
    [upload],
  );

  const requestInput = () => ({
    jobId: upload!.job.id,
    projectId,
    mapping: Object.fromEntries(Object.entries(mapping).filter(([, column]) => Boolean(column))) as Record<string, string>,
    skipDuplicates,
    defaults: defaultAssigneeId ? { assigneeId: defaultAssigneeId } : undefined,
  });

  const onUpload = (file: File | undefined) => {
    if (!file) return;
    uploadImport.mutate(file, {
      onSuccess: (result) => {
        setUpload(result);
        setMapping(suggestMapping(result.headers));
        setStep('map');
        toast.success('File parsed', `${result.rowCount} data row(s) found.`);
      },
      onError: (error) => toast.error('Could not read the file', error.message),
    });
  };

  const onPreview = () => {
    if (!projectId) {
      toast.error('Choose a target project first');
      return;
    }
    if (!mapping.title) {
      toast.error('Map the task title column');
      return;
    }
    previewImport.mutate(requestInput(), {
      onSuccess: (result) => {
        setPreview(result);
        setStep('preview');
      },
      onError: (error) => toast.error('Could not validate the rows', error.message),
    });
  };

  const onCommit = () => {
    commitImport.mutate(requestInput(), {
      onSuccess: (result) => {
        setReport(result);
        setStep('done');
        toast.success('Import complete', `${result.summary.imported ?? 0} task(s) created.`);
      },
      onError: (error) => toast.error('Import failed', error.message),
    });
  };

  const reset = () => {
    setStep('upload');
    setUpload(null);
    setPreview(null);
    setReport(null);
    setMapping({});
    setProjectId('');
    setDefaultAssigneeId('');
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-white">
          <UploadIcon className="text-lg text-indigo-500" />
          Import spreadsheet
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Migrate a CSV or XLSX tracker: map columns, review every row, then commit. Nothing is written until you confirm.
        </p>
      </div>

      <ol className="flex flex-wrap items-center gap-2 text-xs">
        {(['upload', 'map', 'preview', 'done'] as Step[]).map((item, index) => (
          <li key={item} className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-full font-semibold',
                step === item
                  ? 'bg-indigo-600 text-white'
                  : ['upload', 'map', 'preview', 'done'].indexOf(step) > index
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
              )}
            >
              {index + 1}
            </span>
            <span className={cn('capitalize', step === item ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400')}>
              {item === 'done' ? 'Report' : item}
            </span>
            {index < 3 && <span className="text-slate-300 dark:text-slate-600">→</span>}
          </li>
        ))}
      </ol>

      {step === 'upload' && (
        <Card>
          <CardHeader title="1. Upload a file" description="CSV, TSV or XLSX up to 10 MB and 5,000 rows." />
          <CardBody className="space-y-3">
            <label
              htmlFor="import-file"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-6 py-10 text-center hover:border-indigo-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/40"
            >
              <UploadIcon className="text-2xl text-slate-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {uploadImport.isPending ? 'Reading the file…' : 'Choose a CSV/XLSX file'}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Tip: in Google Sheets use File → Download → CSV so header names are preserved.
              </span>
              <input
                id="import-file"
                type="file"
                accept=".csv,.tsv,.txt,.xlsx"
                className="sr-only"
                onChange={(event) => onUpload(event.target.files?.[0])}
              />
            </label>
            {uploadImport.isError && <Alert variant="error">{uploadImport.error.message}</Alert>}
          </CardBody>
        </Card>
      )}

      {step === 'map' && upload && (
        <Card>
          <CardHeader
            title="2. Map the columns"
            description={`${upload.job.filename} · ${upload.rowCount} row(s) · ${upload.job.sourceFormat}`}
          />
          <CardBody className="space-y-4">
            {upload.preambleRows > 0 && (
              <Alert variant="info">
                Header detected on row {upload.headerRowNumber}; {upload.preambleRows} title/KPI row
                {upload.preambleRows === 1 ? '' : 's'} above it were ignored.
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Target project"
                placeholder="Choose a project"
                options={(projects.data?.data.projects ?? []).map((project) => ({
                  value: project.id,
                  label: `${project.code} — ${project.name}`,
                }))}
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setDefaultAssigneeId('');
                }}
              />
              <Select
                label="Default assignee (optional)"
                placeholder="Leave unassigned"
                options={(members.data?.members ?? []).map((member) => ({
                  value: member.userId,
                  label: member.displayName,
                }))}
                value={defaultAssigneeId}
                disabled={!projectId}
                onChange={(event) => setDefaultAssigneeId(event.target.value)}
              />
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                    <th scope="col" className="px-4 py-2 font-medium">Target field</th>
                    <th scope="col" className="px-4 py-2 font-medium">Spreadsheet column</th>
                    <th scope="col" className="px-4 py-2 font-medium">Sample</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {IMPORT_FIELDS.map((field) => {
                    const config = IMPORT_FIELD_LABELS[field];
                    const column = mapping[field];
                    const columnIndex = column ? upload.headers.indexOf(column) : -1;
                    const sample = columnIndex >= 0 ? upload.sampleRows[0]?.[columnIndex] : undefined;
                    return (
                      <tr key={field}>
                        <td className="px-4 py-2">
                          <span className="font-medium text-slate-800 dark:text-slate-100">
                            {config.label}
                            {config.required && <span className="ml-1 text-red-500">*</span>}
                          </span>
                          {config.hint && <p className="text-[11px] text-slate-400 dark:text-slate-500">{config.hint}</p>}
                        </td>
                        <td className="px-4 py-2">
                          <Select
                            label=""
                            aria-label={`Column for ${config.label}`}
                            className="w-64"
                            placeholder="Not mapped"
                            options={headerOptions}
                            value={column ?? ''}
                            onChange={(event) =>
                              setMapping((current) => ({ ...current, [field]: event.target.value || undefined }))
                            }
                          />
                        </td>
                        <td className="max-w-[220px] px-4 py-2">
                          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{sample || '—'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(event) => setSkipDuplicates(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-indigo-600 dark:border-slate-600"
              />
              Skip rows whose title already exists in the project (recommended)
            </label>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={reset}>
                Start over
              </Button>
              <Button onClick={onPreview} loading={previewImport.isPending} disabled={!projectId || !mapping.title}>
                Validate rows
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 'preview' && preview && (
        <Card>
          <CardHeader
            title="3. Review and confirm"
            description="Invalid rows are never imported; fix them in the file and re-upload to include them."
          />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">{preview.summary.valid} ready</Badge>
              {preview.summary.invalid > 0 && <Badge variant="danger">{preview.summary.invalid} invalid</Badge>}
              {preview.summary.duplicates > 0 && <Badge variant="warning">{preview.summary.duplicates} skipped</Badge>}
              {(preview.summary.labelsToCreate?.length ?? 0) > 0 && (
                <Badge variant="info">Labels to create: {preview.summary.labelsToCreate!.join(', ')}</Badge>
              )}
            </div>

            {preview.errors.length > 0 && (
              <Alert variant="warning" title={`${preview.errors.length} row(s) need attention`}>
                <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-xs">
                  {preview.errors.map((row) => (
                    <li key={row.rowNumber}>
                      Row {row.rowNumber}: {row.errors.map((error) => `${error.path} — ${error.message}`).join('; ')}
                    </li>
                  ))}
                </ul>
              </Alert>
            )}

            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                    <th scope="col" className="px-4 py-2 font-medium">Row</th>
                    <th scope="col" className="px-4 py-2 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2 font-medium">Title</th>
                    <th scope="col" className="px-4 py-2 font-medium">Status / priority</th>
                    <th scope="col" className="px-4 py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {preview.preview.map((row) => (
                    <tr key={row.rowNumber}>
                      <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">{row.rowNumber}</td>
                      <td className="px-4 py-2">
                        <Badge variant={STATUS_TONES[row.status] ?? 'neutral'}>{row.status.toLowerCase()}</Badge>
                      </td>
                      <td className="max-w-[260px] px-4 py-2">
                        <span className="block truncate text-slate-800 dark:text-slate-100">
                          {String(row.normalized?.title ?? row.raw[Object.keys(row.raw)[0]] ?? '—')}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                        {row.normalized ? (
                          <>
                            {String(row.normalized.statusId ? 'mapped' : 'default')} ·{' '}
                            {String(row.normalized.priorityId ? 'mapped' : 'default')}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="max-w-[240px] px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
                        {row.errors.length > 0 ? row.errors.map((error) => error.message).join('; ') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setStep('map')}>
                Back to mapping
              </Button>
              <Button
                onClick={onCommit}
                loading={commitImport.isPending}
                disabled={preview.summary.valid === 0}
              >
                Import {preview.summary.valid} task(s)
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 'done' && report && (
        <Card>
          <CardHeader title="4. Import report" description="The audit log records who imported what and when." />
          <CardBody className="space-y-4">
            <Alert variant="success" title={`${report.summary.imported ?? 0} task(s) imported`}>
              {report.summary.skipped ? `${report.summary.skipped} row(s) skipped. ` : ''}
              {report.summary.invalid ? `${report.summary.invalid} row(s) were invalid. ` : ''}
              {report.summary.labelsCreated ? `${report.summary.labelsCreated} label(s) created.` : ''}
            </Alert>
            {report.summary.taskKeys && report.summary.taskKeys.length > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                First keys: {report.summary.taskKeys.slice(0, 8).join(', ')}
                {report.summary.taskKeys.length > 8 ? ` … +${report.summary.taskKeys.length - 8} more` : ''}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {upload && (
                <Link
                  to={`/projects/${projectId}`}
                  className="inline-flex h-10 items-center rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  Open the project
                </Link>
              )}
              <Button variant="secondary" onClick={reset}>
                Import another file
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Recent imports" description="Newest first" />
        {jobs.isLoading && <CardBody className="text-sm text-slate-500 dark:text-slate-400">Loading…</CardBody>}
        {!jobs.isLoading && (jobs.data?.data.imports.length ?? 0) === 0 && (
          <CardBody>
            <EmptyState title="No imports yet" description="Upload a spreadsheet to migrate your existing tracker." />
          </CardBody>
        )}
        {(jobs.data?.data.imports.length ?? 0) > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {jobs.data!.data.imports.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-800 dark:text-slate-100">{job.filename}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {job.sourceFormat} · {formatDateTime(job.createdAt)}
                    {job.createdBy ? ` · ${job.createdBy.displayName}` : ''}
                  </p>
                </div>
                <Badge variant={job.status === 'COMMITTED' ? 'success' : job.status === 'VALIDATED' ? 'info' : 'neutral'}>
                  {job.status.toLowerCase()}
                </Badge>
                {job.summary && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {job.summary.imported ?? job.summary.valid} imported
                  </span>
                )}
                <span className="text-xs text-slate-400 dark:text-slate-500">{formatRelative(job.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
