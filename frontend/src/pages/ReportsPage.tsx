import { useState } from 'react';
import { Avatar } from '../components/ui/Avatar';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { BarChart, DonutChart, LineChart } from '../components/charts/Charts';
import { BarChartIcon } from '../components/ui/icons';
import { useProjectAnalytics } from '../features/analytics/queries';
import { useProjects } from '../features/projects/queries';
import { cn } from '../lib/cn';
import { formatDate } from '../lib/format';
import { PASTEL } from '../lib/palette';

function Kpi({ label, value, tone = 'neutral', hint }: { label: string; value: string | number; tone?: 'neutral' | 'success' | 'danger' | 'warning'; hint?: string }) {
  const tones = {
    neutral: 'text-slate-900 dark:text-white',
    success: 'text-emerald-600 dark:text-emerald-400',
    danger: 'text-red-600 dark:text-red-400',
    warning: 'text-amber-600 dark:text-amber-400',
  } as const;
  return (
    <Card className="px-4 py-3">
      <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">{label}</p>
      <p className={cn('mt-0.5 text-2xl font-semibold tabular-nums', tones[tone])}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
    </Card>
  );
}

/** Project analytics: distributions, trends, burndown, velocity and workload. */
export function ReportsPage() {
  const projects = useProjects({ includeArchived: true, pageSize: 100 });
  const projectList = projects.data?.data.projects ?? [];
  const [projectId, setProjectId] = useState('');
  const [days, setDays] = useState(30);

  const selectedId = projectId || projectList[0]?.id;
  const analytics = useProjectAnalytics(selectedId, days);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-white">
          <BarChartIcon className="text-lg text-indigo-500" />
          Reports
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Completion, distributions, trends and velocity for a project you can access.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="w-80">
          <Select
            label="Project"
            placeholder={projectList.length === 0 ? 'No accessible projects' : 'Choose a project'}
            options={projectList.map((project) => ({ value: project.id, label: `${project.code} — ${project.name}` }))}
            value={selectedId ?? ''}
            onChange={(event) => setProjectId(event.target.value)}
          />
        </div>
        <div className="w-44">
          <Select
            label="Window"
            options={[
              { value: '14', label: 'Last 14 days' },
              { value: '30', label: 'Last 30 days' },
              { value: '60', label: 'Last 60 days' },
              { value: '90', label: 'Last 90 days' },
            ]}
            value={String(days)}
            onChange={(event) => setDays(Number(event.target.value))}
          />
        </div>
      </div>

      {!selectedId && <EmptyState title="No projects to report on" description="Create or join a project first." />}

      {analytics.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      )}

      {analytics.isError && (
        <ErrorState title="Could not load analytics" description={analytics.error.message} onRetry={() => analytics.refetch()} />
      )}

      {analytics.data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Completion" value={`${analytics.data.completion.donePercent}%`} tone="success" hint={`${analytics.data.completion.done} of ${analytics.data.completion.total} tasks`} />
            <Kpi label="Open tasks" value={analytics.data.completion.open} />
            <Kpi label="Overdue" value={analytics.data.completion.overdue} tone={analytics.data.completion.overdue > 0 ? 'danger' : 'neutral'} />
            <Kpi
              label="Blocked"
              value={analytics.data.completion.blocked}
              tone={analytics.data.completion.blocked > 0 ? 'warning' : 'neutral'}
              hint={`${analytics.data.completion.unassigned} unassigned`}
            />
            <Kpi
              label="Avg cycle time"
              value={analytics.data.cycleTime.averageDays !== null ? `${analytics.data.cycleTime.averageDays}d` : '—'}
              hint={`${analytics.data.cycleTime.sampleSize} completed task${analytics.data.cycleTime.sampleSize === 1 ? '' : 's'} sampled`}
            />
            <Kpi label="Cancelled" value={analytics.data.completion.cancelled} />
            <Kpi label="Project progress" value={`${Math.round(analytics.data.project.progress)}%`} />
            <Kpi
              label="Window"
              value={`${analytics.data.windowDays}d`}
              hint={analytics.data.project.targetDate ? `Target ${formatDate(analytics.data.project.targetDate)}` : 'No target date'}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card>
              <CardHeader title="Tasks by status" />
              <CardBody>
                <DonutChart
                  slices={analytics.data.byStatus.map((row) => ({ label: row.name, value: row.count, color: row.color }))}
                  title="Tasks by status"
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Tasks by priority" />
              <CardBody>
                <BarChart
                  title="Tasks by priority"
                  bars={analytics.data.byPriority.map((row) => ({ label: row.name, value: row.count, color: row.color }))}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Tasks by type" />
              <CardBody>
                <BarChart
                  title="Tasks by type"
                  bars={analytics.data.byType.map((row) => ({ label: row.name, value: row.count, color: row.color }))}
                />
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Burndown" description="Remaining work against the ideal line." />
              <CardBody>
                <LineChart
                  title="Remaining tasks per day"
                  points={analytics.data.burndown.map((point) => ({ label: point.date, value: point.remaining }))}
                  color={PASTEL.lavender}
                />
                <LineChart
                  title="Ideal remaining tasks per day"
                  points={analytics.data.burndown.map((point) => ({ label: point.date, value: point.ideal }))}
                  color={PASTEL.slateLight}
                  height={80}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Created vs completed" description="Daily counts in the selected window." />
              <CardBody className="space-y-4">
                <LineChart
                  title="Tasks created per day"
                  points={analytics.data.createdTrend.map((point) => ({ label: point.date, value: point.count }))}
                  color={PASTEL.sky}
                />
                <LineChart
                  title="Tasks completed per day"
                  points={analytics.data.completedTrend.map((point) => ({ label: point.date, value: point.count }))}
                  color={PASTEL.mint}
                />
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Velocity" description="Tasks completed per week (last 8 weeks)." />
              <CardBody>
                <BarChart
                  title="Tasks completed per week"
                  bars={analytics.data.velocity.map((point) => ({
                    label: `Week of ${point.weekStart}`,
                    value: point.completed,
                    color: PASTEL.lilac,
                  }))}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Workload by assignee" description="Within this project." />
              {analytics.data.byAssignee.length === 0 ? (
                <CardBody className="text-sm text-slate-500 dark:text-slate-400">No assigned tasks.</CardBody>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                        <th scope="col" className="px-5 py-2 font-medium">Assignee</th>
                        <th scope="col" className="px-5 py-2 font-medium">Open</th>
                        <th scope="col" className="px-5 py-2 font-medium">Done</th>
                        <th scope="col" className="px-5 py-2 font-medium">Overdue</th>
                        <th scope="col" className="px-5 py-2 font-medium">Est. / logged</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {analytics.data.byAssignee.map((row) => (
                        <tr key={row.user?.id ?? 'unassigned'}>
                          <td className="px-5 py-2.5">
                            {row.user ? (
                              <span className="flex items-center gap-2">
                                <Avatar name={row.user.displayName} src={row.user.avatarUrl} size="sm" />
                                <span className="truncate text-slate-800 dark:text-slate-100">{row.user.displayName}</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Unassigned</span>
                            )}
                          </td>
                          <td className="px-5 py-2.5 tabular-nums text-slate-700 dark:text-slate-200">{row.open}</td>
                          <td className="px-5 py-2.5 tabular-nums text-slate-700 dark:text-slate-200">{row.done}</td>
                          <td className="px-5 py-2.5 tabular-nums">
                            {row.overdue > 0 ? (
                              <span className="font-medium text-red-600 dark:text-red-400">{row.overdue}</span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="px-5 py-2.5 tabular-nums text-xs text-slate-500 dark:text-slate-400">
                            {row.estimatedHours}h / {row.actualHours}h
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
