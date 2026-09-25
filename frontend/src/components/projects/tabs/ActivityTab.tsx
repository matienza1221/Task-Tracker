import { useState } from 'react';
import { ActivityFeed } from '../../activity/ActivityFeed';
import { useActivity } from '../../../features/projects/queries';
import type { Project } from '../../../features/projects/types';

export function ActivityTab({ project, limit }: { project: Project; limit?: number }) {
  const [page, setPage] = useState(1);
  const activity = useActivity(project.id, page);

  const entries = activity.data?.data.activity ?? [];
  const totalPages = Number(activity.data?.meta.totalPages ?? 1);

  return (
    <ActivityFeed
      entries={entries}
      isLoading={activity.isLoading}
      isError={activity.isError}
      errorMessage={activity.error?.message}
      onRetry={() => activity.refetch()}
      title="Activity"
      description={limit ? `Latest ${limit} events` : 'Every change recorded for this project'}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
      limit={limit}
    />
  );
}
