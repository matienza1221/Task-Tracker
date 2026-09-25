import type { ActivityEntry } from '../features/projects/types';
import { PROJECT_ROLE_LABELS, type ProjectRole } from '../features/users/constants';

function metaString(entry: ActivityEntry, key: string): string | null {
  const value = entry.metadata?.[key];
  return typeof value === 'string' ? value : null;
}

function roleLabel(value: string | null): string {
  if (!value) return 'unknown';
  return PROJECT_ROLE_LABELS[value as ProjectRole] ?? value;
}

function taskSuffix(entry: ActivityEntry): string {
  return entry.task?.key ? ` on ${entry.task.key}` : '';
}

/** Converts an activity row into a human-readable sentence. */
export function describeActivity(entry: ActivityEntry): string {
  const actor = entry.actor.displayName;
  const name = metaString(entry, 'name') ?? metaString(entry, 'title');
  const memberName = metaString(entry, 'displayName');
  const suffix = taskSuffix(entry);

  switch (entry.action) {
    case 'PROJECT_CREATED':
      return `${actor} created the project`;
    case 'PROJECT_UPDATED':
      return `${actor} updated the project`;
    case 'PROJECT_STATUS_CHANGED':
      return `${actor} changed the status from “${entry.oldValue}” to “${entry.newValue}”`;
    case 'PROJECT_ARCHIVED':
      return `${actor} archived the project`;
    case 'PROJECT_UNARCHIVED':
      return `${actor} restored the project from the archive`;
    case 'MEMBER_ADDED':
      return `${actor} added ${memberName ?? 'a member'} as ${roleLabel(metaString(entry, 'projectRole'))}`;
    case 'MEMBER_ROLE_CHANGED':
      return `${actor} changed ${memberName ?? 'a member'} from ${roleLabel(entry.oldValue)} to ${roleLabel(entry.newValue)}`;
    case 'MEMBER_REMOVED':
      return `${actor} removed ${memberName ?? 'a member'} from the project`;
    case 'MILESTONE_CREATED':
      return `${actor} created milestone “${name ?? 'unnamed'}”`;
    case 'MILESTONE_UPDATED':
      return `${actor} updated milestone “${name ?? 'unnamed'}”`;
    case 'MILESTONE_COMPLETED':
      return `${actor} completed milestone “${name ?? 'unnamed'}”`;
    case 'MILESTONE_DELETED':
      return `${actor} deleted milestone “${name ?? 'unnamed'}”`;
    case 'LABEL_CREATED':
      return `${actor} created label “${name ?? 'unnamed'}”`;
    case 'LABEL_UPDATED':
      return `${actor} updated label “${name ?? 'unnamed'}”`;
    case 'LABEL_DELETED':
      return `${actor} deleted label “${name ?? 'unnamed'}”`;
    case 'SAVED_VIEW_CREATED':
      return `${actor} saved a view`;
    case 'SAVED_VIEW_DELETED':
      return `${actor} deleted a saved view`;
    case 'TASK_CREATED':
      return `${actor} created ${entry.task?.key ?? metaString(entry, 'key') ?? 'a task'} “${name ?? 'untitled'}”`;
    case 'TASK_UPDATED': {
      const fields = Array.isArray(entry.metadata?.fields) ? (entry.metadata?.fields as string[]) : [];
      if (entry.field === 'dueDate' && entry.newValue) {
        return `${actor} set the due date to ${entry.newValue}${suffix}`;
      }
      if (fields.length > 0) {
        return `${actor} updated ${fields.join(', ')}${suffix}`;
      }
      return `${actor} updated the task${suffix}`;
    }
    case 'TASK_STATUS_CHANGED':
      return `${actor} changed ${entry.task?.key ?? 'a task'} status from “${entry.oldValue}” to “${entry.newValue}”`;
    case 'TASK_ASSIGNED':
      return `${actor} assigned ${entry.task?.key ?? 'a task'} to ${entry.newValue ?? 'someone'}`;
    case 'TASK_DELETED':
      return `${actor} deleted task ${entry.task?.key ?? metaString(entry, 'key') ?? ''}`.trim();
    default:
      return `${actor} performed ${entry.action.toLowerCase().replaceAll('_', ' ')}`;
  }
}
