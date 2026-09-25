import { cn } from '../../lib/cn';

export function ProgressBar({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Progress'}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-300',
          clamped >= 100 ? 'bg-emerald-500' : 'bg-indigo-500',
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function ProgressStat({ value, className }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <ProgressBar value={clamped} className="flex-1" />
      <span className="w-9 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">{clamped}%</span>
    </div>
  );
}
