import { cn } from '../../lib/cn';
import { LoaderIcon } from './icons';

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-slate-500 dark:text-slate-400', className)}>
      <LoaderIcon className="animate-spin text-lg" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-950">
      <Spinner className="text-lg" label={label} />
    </div>
  );
}
