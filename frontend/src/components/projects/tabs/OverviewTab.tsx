import { Card, CardBody, CardHeader } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { ProgressStat } from '../../ui/ProgressBar';
import { formatDate, formatDateTime } from '../../../lib/format';
import type { Project } from '../../../features/projects/types';

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}

export function OverviewTab({ project }: { project: Project }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Overview" description="Core project information and schedule." />
        <CardBody className="space-y-5">
          <p className="text-sm whitespace-pre-line text-slate-600 dark:text-slate-300">
            {project.description || 'No description yet. Use “Edit project” to add one.'}
          </p>
          <ProgressStat value={project.progress} />
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Status" value={
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: project.status.color }} />
                {project.status.name}
              </span>
            } />
            <Detail label="Priority" value={
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: project.priority.color }} />
                {project.priority.name}
              </span>
            } />
            <Detail label="Start date" value={formatDate(project.startDate)} />
            <Detail label="Target date" value={formatDate(project.targetDate)} />
            <Detail label="Completed" value={formatDate(project.actualCompletionDate)} />
            <Detail label="Progress weighting" value={project.progressWeighting === 'HOURS' ? 'By estimated hours' : 'By task count'} />
          </dl>
        </CardBody>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader title="Team" description="Manager and roster size." />
          <CardBody className="space-y-3 text-sm">
            <Detail
              label="Project manager"
              value={project.manager ? project.manager.displayName : <span className="italic text-slate-500">Unassigned</span>}
            />
            <Detail label="Members" value={`${project.memberCount} member${project.memberCount === 1 ? '' : 's'}`} />
            <Detail label="Milestones" value={`${project.milestoneCount}`} />
            <Detail label="Labels" value={`${project.labelCount}`} />
            {project.isArchived && (
              <p className="pt-1">
                <Badge variant="warning">Archived {formatDateTime(project.archivedAt)}</Badge>
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Identifiers" description="Stable references used across the app." />
          <CardBody className="space-y-3 text-sm">
            <Detail label="Project code" value={<span className="font-mono">{project.code}</span>} />
            <Detail label="Created" value={formatDateTime(project.createdAt)} />
            <Detail label="Last updated" value={formatDateTime(project.updatedAt)} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
