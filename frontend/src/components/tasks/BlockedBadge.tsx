import { Badge } from '../ui/Badge';
import type { Task } from '../../features/tasks/types';
import { unresolvedBlockers } from '../../features/dependencies/types';

/**
 * Shows why a task cannot proceed: an explicit Blocked status or unfinished
 * dependencies. Completed and cancelled blockers are ignored.
 */
export function BlockedBadge({ task, className }: { task: Task; className?: string }) {
  const unmet = unresolvedBlockers(task.blockedBy ?? []);
  const explicitlyBlocked = task.status.category === 'BLOCKED';

  if (unmet.length === 0 && !explicitlyBlocked) return null;
  if (unmet.length === 0) {
    return (
      <Badge variant="danger" className={className}>
        Blocked
      </Badge>
    );
  }

  const label = unmet.length === 1 ? `Waiting on ${unmet[0].key}` : `Waiting on ${unmet.length} tasks`;
  return (
    <Badge variant="danger" className={className} title={unmet.map((item) => `${item.key} — ${item.title}`).join('\n')}>
      {label}
    </Badge>
  );
}
