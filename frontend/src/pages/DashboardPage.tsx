import { Link } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { ProgressBar } from '../components/ui/ProgressBar';
import { ErrorState, Skeleton } from '../components/ui/States';
import { DonutChart } from '../components/charts/Charts';
import { BlockedBadge } from '../components/tasks/BlockedBadge';
import { TaskPriorityBadge, TaskStatusBadge } from '../components/tasks/TaskBadges';
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  RocketIcon,
  ShieldIcon,
} from '../components/ui/icons';
import { useMe } from '../features/auth/queries';
import { useDashboardSummary } from '../features/dashboard/queries';
import { formatDate, formatRelative, formatRole } from '../lib/format';
import { ROADMAP } from '../lib/roadmap';

const CATEGORY_COLORS: Record<string, string> = {
  Backlog: '#64748b',
  'To Do': '#8b5cf6',
  'In Progress': '#3b82f6',
  'In Review': '#f59e0b',
  Testing: '#06b6d4',
  Blocked: '#ef4444',
  Done: '#22c55e',
  Cancelled: '#94a3b8',
};

function StatCard({ label, value, tone = 'neutral', hint }: { label: string; value: number; tone?: 'neutral' | 'success' | 'info' | 'warning' | 'danger'; hint?: string }) {
  const tones = {
    neutral: 'text-slate-900 dark:text-white',
    success: 'text-emerald-600 dark:text-emerald-400',
    info: 'text-sky-600 dark:text-sky-400',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
  } as const;
  return (
    <Card className="px-4 py-3">
      <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</p>
      <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
    </Card>
  );
}

export function DashboardPage() {
  const me = useMe();
  const user = me.data;
  const summary = useDashboardSummary();

  if (summary.isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (summary.isError || !summary.data) {
    return (
      <ErrorState
        title="Could not load your dashboard"
        description={summary.error?.message}
        onRetry={() => summary.refetch()}
      />
    );
  }

  const data = summary.data;
  const taskSlices = [
    { label: 'Backlog', value: data.tasks.backlog },
    { label: 'To Do', value: data.tasks.todo },
    { label: 'In Progress', value: data.tasks.inProgress },
    { label: 'In Review', value: data.tasks.inReview },
    { label: 'Testing', value: data.tasks.testing },
    { label: 'Blocked', value: data.tasks.blocked },
    { label: 'Done', value: data.tasks.done },
    { label: 'Cancelled', value: data.tasks.cancelled },
  ]
    .filter((slice) => slice.value > 0)
    .map((slice) => ({ ...slice, color: CATEGORY_COLORS[slice.label] }));

  const openTasks = data.tasks.total - data.tasks.done - data.tasks.cancelled;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
            Welcome back{user ? `, ${user.displayName.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {data.projects.total} project{data.projects.total === 1 ? '' : 's'} · {openTasks} open task
            {openTasks === 1 ? '' : 's'} across your work
          </p>
        </div>
        {user && <Badge variant="indigo">{formatRole(user.globalRole)}</Badge>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Projects" value={data.projects.total} hint={`${data.projects.archived} archived`} />
        <StatCard label="Active projects" value={data.projects.active} tone="info" hint={`${data.projects.planning} planning`} />
        <StatCard label="Completed projects" value={data.projects.completed} tone="success" />
        <StatCard
          label="Overdue projects"
          value={data.projects.overdue}
          tone={data.projects.overdue > 0 ? 'danger' : 'neutral'}
          hint={data.projects.onHold > 0 ? `${data.projects.onHold} on hold` : undefined}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tasks" value={data.tasks.total} />
        <StatCard label="In progress" value={data.tasks.inProgress} tone="info" />
        <StatCard label="Overdue tasks" value={data.tasks.overdue} tone={data.tasks.overdue > 0 ? 'danger' : 'neutral'} />
        <StatCard
          label="Blocked / waiting"
          value={data.tasks.blocked + data.tasks.waitingOnDependencies}
          tone={data.tasks.blocked + data.tasks.waitingOnDependencies > 0 ? 'warning' : 'neutral'}
          hint={`${data.tasks.unassigned} unassigned`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="My work"
            description="Assigned to you across all projects."
            actions={
              <Link to="/my-tasks" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
                All tasks <ArrowRightIcon className="text-sm" />
              </Link>
            }
          />
          <CardBody className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-800/60">
                <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{data.myWork.open}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Open</p>
              </div>
              <div className="rounded-lg bg-red-50 py-2 dark:bg-red-950/40">
                <p className="text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">{data.myWork.overdue}</p>
                <p className="text-[11px] text-red-600/80 dark:text-red-300/80">Overdue</p>
              </div>
              <div className="rounded-lg bg-amber-50 py-2 dark:bg-amber-950/40">
                <p className="text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">{data.myWork.dueThisWeek}</p>
                <p className="text-[11px] text-amber-600/80 dark:text-amber-300/80">This week</p>
              </div>
            </div>
            {data.myWork.recentlyUpdated.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Nothing is assigned to you right now.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.myWork.recentlyUpdated.map((task) => (
                  <li key={task.id} className="py-2">
                    <Link to={`/tasks/${task.id}`} className="block min-w-0">
                      <span className="block truncate text-sm text-slate-800 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400">
                        <span className="mr-1.5 font-mono text-[11px] text-slate-400">{task.displayKey}</span>
                        {task.title}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <TaskStatusBadge status={task.status} />
                        <TaskPriorityBadge priority={task.priority} />
                        <BlockedBadge task={task} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Tasks by status" description="Across the projects you can access." />
          <CardBody>
            <DonutChart slices={taskSlices} title="Tasks by status" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Upcoming milestones"
            description="Next 30 days"
            actions={<CalendarIcon className="text-base text-violet-500" />}
          />
          <CardBody>
            {data.upcomingMilestones.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No milestones due in the next 30 days.</p>
            ) : (
              <ul className="space-y-2.5">
                {data.upcomingMilestones.map((milestone) => (
                  <li key={milestone.id}>
                    <Link
                      to={`/projects/${milestone.project.id}?tab=milestones`}
                      className="flex items-center justify-between gap-2 text-sm text-slate-800 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">
                          <span className="mr-1.5 font-mono text-[11px] text-slate-400">{milestone.project.code}</span>
                          {milestone.name}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{formatDate(milestone.targetDate)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Your projects"
            description="Most recently updated."
            actions={
              <Link to="/projects" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
                View all <ArrowRightIcon className="text-sm" />
              </Link>
            }
          />
          {data.recentProjects.length === 0 ? (
            <CardBody className="text-sm text-slate-500 dark:text-slate-400">No accessible projects yet.</CardBody>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.recentProjects.map((project) => (
                <li key={project.id}>
                  <Link
                    to={`/projects/${project.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                        <span className="font-mono text-[11px] text-slate-400">{project.code}</span>
                        <span className="truncate">{project.name}</span>
                      </p>
                      <div className="mt-1.5 max-w-xs">
                        <ProgressBar value={project.progress} label={`${project.code} progress`} />
                      </div>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ backgroundColor: `${project.status.color}1a`, color: project.status.color }}
                    >
                      {project.status.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Your account" description="From the authenticated session." />
          <CardBody className="space-y-3 text-xs text-slate-500 dark:text-slate-400">
            <p className="truncate text-sm text-slate-900 dark:text-slate-100">{user?.displayName}</p>
            <p className="truncate">{user?.email}</p>
            <p>{user?.timezone}</p>
            <p>
              Last sign-in: {user?.lastLoginAt ? `${formatRelative(user.lastLoginAt)}` : '—'}
            </p>
            <div className="space-y-2 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
              <p className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                <ShieldIcon className="mt-0.5 shrink-0 text-base text-emerald-500" />
                HTTP-only session, CSRF tokens, rate limiting and audit logging are active.
              </p>
              <p className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                <ClockIcon className="mt-0.5 shrink-0 text-base text-sky-500" />
                Sessions expire after inactivity and are revoked on password change.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Implementation status"
          description="Built incrementally; each phase keeps the previous ones working."
          actions={<RocketIcon className="text-base text-indigo-500" />}
        />
        <CardBody className="divide-y divide-slate-100 p-0 dark:divide-slate-800">
          {ROADMAP.map((phase) => (
            <div key={phase.phase} className="flex items-start gap-3 px-5 py-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {phase.status === 'complete' ? <CheckCircleIcon className="text-sm text-emerald-500" /> : phase.phase}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Phase {phase.phase} — {phase.title}
                  </p>
                  <Badge variant={phase.status === 'complete' ? 'success' : phase.status === 'in_progress' ? 'warning' : 'neutral'}>
                    {phase.status === 'complete' ? 'Complete' : phase.status === 'in_progress' ? 'In progress' : 'Planned'}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{phase.summary}</p>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
