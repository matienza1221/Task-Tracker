import { cn } from '../../lib/cn';
import type { TaskLabelRef } from '../../features/tasks/types';

export function LabelChips({ labels }: { labels: TaskLabelRef[] }) {
  if (labels.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {labels.map((label) => (
        <span
          key={label.id}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-slate-700 dark:text-slate-300"
        >
          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} />
          {label.name}
        </span>
      ))}
    </span>
  );
}

export function LabelPicker({
  labels,
  selected,
  onChange,
  disabled,
}: {
  labels: TaskLabelRef[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  if (labels.length === 0) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">No labels available for this project yet.</p>;
  }
  return (
    <div role="group" aria-label="Labels" className="flex flex-wrap gap-1.5">
      {labels.map((label) => {
        const isSelected = selected.includes(label.id);
        return (
          <button
            key={label.id}
            type="button"
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => onChange(isSelected ? selected.filter((id) => id !== label.id) : [...selected, label.id])}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
              isSelected
                ? 'border-transparent text-white'
                : 'border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
              disabled && 'cursor-not-allowed opacity-60',
            )}
            style={isSelected ? { backgroundColor: label.color } : undefined}
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: isSelected ? '#ffffff' : label.color }}
            />
            {label.name}
          </button>
        );
      })}
    </div>
  );
}
