import type { TaskPriorityRef, TaskStatusRef, TaskTypeRef } from '../../features/tasks/types';

function Chip({ color, label, title }: { color: string; label: string; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{ backgroundColor: `${color}1a`, color }}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatusRef }) {
  return <Chip color={status.color} label={status.name} title={`Workflow category: ${status.category}`} />;
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriorityRef }) {
  return <Chip color={priority.color} label={priority.name} title={`Weight ${priority.weight}`} />;
}

export function TaskTypeBadge({ type }: { type: TaskTypeRef }) {
  return <Chip color={type.color} label={type.name} />;
}
