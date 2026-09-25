import { useState } from 'react';
import { Avatar } from '../components/ui/Avatar';
import { Badge } from '../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { ErrorState, Skeleton } from '../components/ui/States';
import { UsersIcon } from '../components/ui/icons';
import { useProjects } from '../features/projects/queries';
import { useWorkload } from '../features/workload/queries';
import { cn } from '../lib/cn';
import { formatRole } from '../lib/format';

const LOAD_STYLES = {
  low: { label: 'Light', bar: 'bg-emerald-500', badge: 'success' as const },
  medium: { label: 'Balanced', bar: 'bg-amber-500', badge: 'warning' as const },
  high: { label: 'Heavy', bar: 'bg-red-500', badge: 'danger' as const },
};

/** Team workload across accessible projects (or a single project). */
export function TeamPage() {
  const [projectId, setProjectId] = useState('');
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const projects = useProjects({ pageSize: 100 });
  const workload = useWorkload({
    projectId: projectId || undefined,
    includeCompleted: includeCompleted || undefined,
  });

  const data = workload.data;
  const maxLoad = Math.max(...(data?.rows ?? []).map((row) => row.loadScore), 1);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-white">
          <UsersIcon className="text-lg text-indigo-500" />
          Team workload
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Open work, overdue items and logged hours per developer, scoped to the projects you can access.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="w-72">
          <Select
            label="Project"
            placeholder="All projects"
            options={(projects.data?.data.projects ?? []).map((project) => ({
              value: project.id,
              label: `${project.code} — ${project.name}`,
            }))}
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 pb-2.5 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={includeCompleted}
            onChange={(event) => setIncludeCompleted(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-indigo-600 dark:border-slate-600"
          />
          Include people with only completed work
        </label>
      </div>

      {workload.isLoading && (
        <Card>
          <CardBody className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardBody>
        </Card>
      )}

      {workload.isError && (
        <ErrorState title="Could not load workload" description={workload.error.message} onRetry={() => workload.refetch()} />
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Active tasks', value: data.totals.activeTasks },
              { label: 'Overdue', value: data.totals.overdueTasks, danger: data.totals.overdueTasks > 0 },
              { label: 'Estimated hours', value: data.totals.estimatedHours },
              { label: 'Logged hours', value: data.totals.actualHours },
            ].map((item) => (
              <Card key={item.label} className="px-4 py-3">
                <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">{item.label}</p>
                <p
                  className={cn(
                    'mt-0.5 text-2xl font-semibold tabular-nums',
                    item.danger ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white',
                  )}
                >
                  {item.value}
                </p>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader
              title="Per developer"
              description={`${data.rows.length} people with active or completed work${data.unassigned.activeTasks > 0 ? ` · ${data.unassigned.activeTasks} unassigned task${data.unassigned.activeTasks === 1 ? '' : 's'}` : ''}`}
            />
            {data.rows.length === 0 ? (
              <CardBody className="text-sm text-slate-500 dark:text-slate-400">No assigned work in scope.</CardBody>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                      <th scope="col" className="px-5 py-2.5 font-medium">Developer</th>
                      <th scope="col" className="px-5 py-2.5 font-medium">Active</th>
                      <th scope="col" className="px-5 py-2.5 font-medium">In progress</th>
                      <th scope="col" className="px-5 py-2.5 font-medium">Blocked</th>
                      <th scope="col" className="px-5 py-2.5 font-medium">Overdue</th>
                      <th scope="col" className="px-5 py-2.5 font-medium">Done</th>
                      <th scope="col" className="px-5 py-2.5 font-medium">Estimated / logged</th>
                      <th scope="col" className="px-5 py-2.5 font-medium">Load</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.rows.map((row) => {
                      const style = LOAD_STYLES[row.loadLevel];
                      return (
                        <tr key={row.user.id}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <Avatar name={row.user.displayName} src={row.user.avatarUrl} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-slate-900 dark:text-slate-100">{row.user.displayName}</p>
                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                  {formatRole(row.user.globalRole)}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3 tabular-nums text-slate-700 dark:text-slate-200">{row.activeTasks}</td>
                          <td className="px-5 py-3 tabular-nums text-slate-700 dark:text-slate-200">{row.inProgressTasks}</td>
                          <td className="px-5 py-3 tabular-nums">
                            {row.blockedTasks > 0 ? (
                              <span className="font-medium text-red-600 dark:text-red-400">{row.blockedTasks}</span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="px-5 py-3 tabular-nums">
                            {row.overdueTasks > 0 ? (
                              <span className="font-medium text-red-600 dark:text-red-400">{row.overdueTasks}</span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="px-5 py-3 tabular-nums text-slate-700 dark:text-slate-200">{row.completedTasks}</td>
                          <td className="px-5 py-3 tabular-nums text-xs text-slate-500 dark:text-slate-400">
                            {row.estimatedHours}h / {row.actualHours}h
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                <div
                                  className={cn('h-full rounded-full', style.bar)}
                                  style={{ width: `${Math.min((row.loadScore / maxLoad) * 100, 100)}%` }}
                                />
                              </div>
                              <Badge variant={style.badge}>{style.label}</Badge>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {data.unassigned.activeTasks > 0 && (
              <CardBody className="border-t border-slate-100 text-sm dark:border-slate-800">
                <p className="text-slate-600 dark:text-slate-300">
                  <span className="font-medium">{data.unassigned.activeTasks}</span> unassigned task
                  {data.unassigned.activeTasks === 1 ? '' : 's'}
                  {data.unassigned.overdueTasks > 0 && (
                    <span className="text-red-600 dark:text-red-400"> · {data.unassigned.overdueTasks} overdue</span>
                  )}{' '}
                  · {data.unassigned.estimatedHours}h estimated
                </p>
              </CardBody>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
