import type { ActivityEntry } from '../../features/projects/types';
import { Avatar } from '../ui/Avatar';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Pagination } from '../ui/Pagination';
import { EmptyState, ErrorState, Skeleton } from '../ui/States';
import { describeActivity } from '../../lib/activity';
import { formatDateTime, formatRelative } from '../../lib/format';

export interface ActivityFeedProps {
  entries: ActivityEntry[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  title: string;
  description?: string;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  limit?: number;
}

/** Timeline used by the project activity tab and the task detail page. */
export function ActivityFeed({
  entries,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  title,
  description,
  page = 1,
  totalPages = 1,
  onPageChange,
  limit,
}: ActivityFeedProps) {
  const visible = limit ? entries.slice(0, limit) : entries;

  return (
    <Card>
      <CardHeader title={title} description={description} />
      {isLoading && (
        <CardBody className="space-y-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-5/6" />
          <Skeleton className="h-9 w-4/6" />
        </CardBody>
      )}
      {isError && (
        <CardBody>
          <ErrorState title="Could not load activity" description={errorMessage} onRetry={onRetry} />
        </CardBody>
      )}
      {!isLoading && !isError && visible.length === 0 && (
        <CardBody>
          <EmptyState title="No activity yet" description="Changes are recorded here automatically." />
        </CardBody>
      )}
      {visible.length > 0 && (
        <ol className="divide-y divide-slate-100 dark:divide-slate-800">
          {visible.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
              <Avatar name={entry.actor.displayName} size="sm" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-700 dark:text-slate-200">{describeActivity(entry)}</p>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500" title={formatDateTime(entry.createdAt)}>
                  {formatRelative(entry.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {!limit && onPageChange && (
        <CardBody className="border-t border-slate-100 dark:border-slate-800">
          <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
        </CardBody>
      )}
    </Card>
  );
}
