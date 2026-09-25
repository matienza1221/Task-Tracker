import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Modal } from '../components/ui/Modal';
import { Tabs, TabPanel } from '../components/ui/Tabs';
import { ErrorState, Skeleton } from '../components/ui/States';
import { ProjectForm } from '../components/projects/ProjectForm';
import { ActivityTab } from '../components/projects/tabs/ActivityTab';
import { LabelsTab } from '../components/projects/tabs/LabelsTab';
import { MembersTab } from '../components/projects/tabs/MembersTab';
import { MilestonesTab } from '../components/projects/tabs/MilestonesTab';
import { OverviewTab } from '../components/projects/tabs/OverviewTab';
import { TasksTab } from '../components/projects/tabs/TasksTab';
import { useArchiveProject, useDeleteProject, useProject } from '../features/projects/queries';
import { projectRoleCan } from '../features/auth/roles';
import { useMe } from '../features/auth/queries';
import { formatDate } from '../lib/format';
import { toast } from '../stores/toastStore';
import { ApiError } from '../lib/api/errors';
import { ArrowRightIcon, CalendarIcon, UsersIcon } from '../components/ui/icons';

const TAB_IDS = ['overview', 'tasks', 'members', 'milestones', 'labels', 'activity'] as const;
type TabId = (typeof TAB_IDS)[number];

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const me = useMe();
  const project = useProject(projectId);
  const archiveProject = useArchiveProject(projectId ?? '');
  const deleteProject = useDeleteProject();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const rawTab = searchParams.get('tab') as TabId | null;
  const tab: TabId = rawTab && TAB_IDS.includes(rawTab) ? rawTab : 'overview';

  if (project.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (project.isError) {
    const notFound = project.error instanceof ApiError && project.error.isNotFound;
    return (
      <div className="space-y-4">
        <ErrorState
          title={notFound ? 'Project not found' : 'Could not load project'}
          description={
            notFound
              ? 'This project does not exist or you do not have access to it.'
              : project.error.message
          }
          onRetry={notFound ? undefined : () => project.refetch()}
        />
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          Back to projects <ArrowRightIcon className="text-sm" />
        </Link>
      </div>
    );
  }

  const data = project.data!.project;
  const canUpdate = projectRoleCan(data.myRole, 'project:update');
  const canArchive = projectRoleCan(data.myRole, 'project:archive');
  const canDelete = me.data?.globalRole === 'ADMIN';
  const canExport = projectRoleCan(data.myRole, 'export:run');

  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500 dark:text-slate-400">
        <Link to="/projects" className="hover:text-indigo-600 dark:hover:text-indigo-400">
          Projects
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700 dark:text-slate-200">{data.name}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {data.code}
            </span>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{data.name}</h1>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: `${data.status.color}1a`, color: data.status.color }}
            >
              {data.status.name}
            </span>
            {data.isArchived && <Badge variant="warning">Archived</Badge>}
            {data.myRole && <Badge variant="indigo">{data.myRole === 'ADMIN' ? 'Admin access' : `${data.myRole} access`}</Badge>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <UsersIcon className="text-sm" /> {data.memberCount} member{data.memberCount === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon className="text-sm" />
              {data.targetDate ? `Target ${formatDate(data.targetDate)}` : 'No target date'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canExport && (
            <a
              href={`/api/projects/${data.id}/export.csv`}
              download
              className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Export CSV
            </a>
          )}
          {canUpdate && (
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              Edit project
            </Button>
          )}
          {canArchive && (
            <Button
              variant="secondary"
              loading={archiveProject.isPending}
              onClick={() =>
                archiveProject.mutate(!data.isArchived, {
                  onSuccess: () => toast.success(data.isArchived ? 'Project restored' : 'Project archived'),
                  onError: (error) => toast.error('Could not update archive state', error.message),
                })
              }
            >
              {data.isArchived ? 'Unarchive' : 'Archive'}
            </Button>
          )}
          {canDelete && (
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          )}
        </div>
      </div>

      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'tasks', label: 'Tasks' },
          { id: 'members', label: 'Members', badge: <Badge variant="neutral">{data.memberCount}</Badge> },
          { id: 'milestones', label: 'Milestones', badge: <Badge variant="neutral">{data.milestoneCount}</Badge> },
          { id: 'labels', label: 'Labels', badge: <Badge variant="neutral">{data.labelCount}</Badge> },
          { id: 'activity', label: 'Activity' },
        ]}
        value={tab}
        onChange={(next) => {
          const params = new URLSearchParams(searchParams);
          if (next === 'overview') params.delete('tab');
          else params.set('tab', next);
          setSearchParams(params, { replace: true });
        }}
      />

      <TabPanel id="overview" value={tab}>
        <div className="space-y-5">
          <OverviewTab project={data} />
          <ActivityTab project={data} limit={5} />
        </div>
      </TabPanel>
      <TabPanel id="tasks" value={tab}>
        <TasksTab project={data} />
      </TabPanel>
      <TabPanel id="members" value={tab}>
        <MembersTab project={data} />
      </TabPanel>
      <TabPanel id="milestones" value={tab}>
        <MilestonesTab project={data} />
      </TabPanel>
      <TabPanel id="labels" value={tab}>
        <LabelsTab project={data} />
      </TabPanel>
      <TabPanel id="activity" value={tab}>
        <ActivityTab project={data} />
      </TabPanel>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit ${data.code}`}
        description="Project code is immutable; task keys derive from it."
        size="lg"
      >
        <ProjectForm project={data} onSuccess={() => setEditOpen(false)} onCancel={() => setEditOpen(false)} />
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete project"
        description={`Delete ${data.code} — ${data.name}? The project is archived and hidden; an administrator can purge it permanently later.`}
        confirmLabel="Delete project"
        loading={deleteProject.isPending}
        onConfirm={() =>
          deleteProject.mutate(
            { projectId: data.id },
            {
              onSuccess: () => {
                toast.success('Project deleted');
                window.location.assign('/projects');
              },
              onError: (error) => {
                toast.error('Could not delete project', error.message);
                setDeleteOpen(false);
              },
            },
          )
        }
        onClose={() => setDeleteOpen(false)}
      />

      {data.isArchived && (
        <Alert variant="info">
          This project is archived. It stays readable but is hidden from the default project list.
        </Alert>
      )}
    </div>
  );
}
