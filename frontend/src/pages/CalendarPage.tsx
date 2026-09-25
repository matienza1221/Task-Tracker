import { useState } from 'react';
import { CalendarIcon } from '../components/ui/icons';
import { Select } from '../components/ui/Select';
import { CalendarMonth } from '../components/calendar/CalendarMonth';
import { useProjects } from '../features/projects/queries';

/**
 * Cross-project calendar: task due/start dates, milestone targets and project
 * targets for the visible month, scoped to the projects the user can access.
 */
export function CalendarPage() {
  const [month, setMonth] = useState(() => new Date());
  const [projectId, setProjectId] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const projects = useProjects({ includeArchived: false, pageSize: 100 });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-white">
          <CalendarIcon className="text-lg text-indigo-500" />
          Calendar
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Deadlines, milestones and project targets across every project you belong to.
        </p>
      </div>

      <CalendarMonth
        month={month}
        onMonthChange={setMonth}
        filters={{ projectId: projectId || undefined, scope: mineOnly ? 'mine' : 'all' }}
        toolbar={
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="w-64">
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
                checked={mineOnly}
                onChange={(event) => setMineOnly(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-indigo-600 dark:border-slate-600"
              />
              Only my tasks
            </label>
          </div>
        }
        emptyHint="Tasks with due or start dates, milestones and project targets appear here."
      />
    </div>
  );
}
