import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';
import { ProgressStat } from '../ui/ProgressBar';
import { CalendarIcon, UsersIcon } from '../ui/icons';
import { formatDate } from '../../lib/format';
import { cn } from '../../lib/cn';
import type { Project } from '../../features/projects/types';
import { Link } from 'react-router-dom';

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className={cn(
        'group flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors',
        'hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-800',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
            {project.code}
          </p>
          <h2 className="truncate text-sm font-semibold text-slate-900 group-hover:text-indigo-700 dark:text-slate-100 dark:group-hover:text-indigo-300">
            {project.name}
          </h2>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: `${project.status.color}1a`, color: project.status.color }}
          >
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.status.color }} />
            {project.status.name}
          </span>
          {project.isArchived && <Badge variant="warning">Archived</Badge>}
        </div>
      </div>

      {project.description && (
        <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{project.description}</p>
      )}

      <ProgressStat value={project.progress} />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          {project.manager ? (
            <>
              <Avatar name={project.manager.displayName} src={project.manager.avatarUrl} size="sm" />
              <span className="truncate">{project.manager.displayName}</span>
            </>
          ) : (
            <span className="italic">No manager</span>
          )}
        </span>
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <UsersIcon className="text-sm" /> {project.memberCount}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarIcon className="text-sm" />
            {project.targetDate ? formatDate(project.targetDate) : 'No target'}
          </span>
        </span>
      </div>
    </Link>
  );
}
