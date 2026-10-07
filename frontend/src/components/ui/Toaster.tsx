import { cn } from '../../lib/cn';
import { useToastStore, type ToastVariant } from '../../stores/toastStore';
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon, XIcon } from './icons';

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-emerald-200 bg-white text-slate-900 dark:border-emerald-900 dark:bg-slate-900 dark:text-slate-100',
  error: 'border-red-200 bg-white text-slate-900 dark:border-red-900 dark:bg-slate-900 dark:text-slate-100',
  info: 'border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
};

function VariantIcon({ variant }: { variant: ToastVariant }) {
  if (variant === 'success') return <CheckCircleIcon className="mt-0.5 shrink-0 text-base text-emerald-500" />;
  if (variant === 'error') return <AlertTriangleIcon className="mt-0.5 shrink-0 text-base text-red-500" />;
  return <InfoIcon className="mt-0.5 shrink-0 text-base text-sky-500" />;
}

export function Toaster() {
  const { toasts, dismiss, setPaused } = useToastStore();

  return (
    <div
      aria-label="Notifications"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 p-4 sm:items-end"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role={item.variant === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg',
            VARIANT_STYLES[item.variant],
          )}
        >
          <VariantIcon variant={item.variant} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{item.title}</p>
            {item.description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.description}</p>}
          </div>
          <button
            type="button"
            onClick={() => dismiss(item.id)}
            aria-label="Dismiss notification"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <XIcon className="text-sm" />
          </button>
        </div>
      ))}
    </div>
  );
}
