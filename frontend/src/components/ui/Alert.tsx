import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon } from './icons';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

const VARIANTS: Record<AlertVariant, { classes: string; icon: ReactNode }> = {
  info: {
    classes: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-200',
    icon: <InfoIcon className="mt-0.5 shrink-0 text-base" />,
  },
  success: {
    classes:
      'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200',
    icon: <CheckCircleIcon className="mt-0.5 shrink-0 text-base" />,
  },
  warning: {
    classes: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200',
    icon: <AlertTriangleIcon className="mt-0.5 shrink-0 text-base" />,
  },
  error: {
    classes: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200',
    icon: <AlertTriangleIcon className="mt-0.5 shrink-0 text-base" />,
  },
};

export function Alert({
  variant = 'info',
  title,
  children,
  className,
  role,
}: {
  variant?: AlertVariant;
  title?: string;
  children?: ReactNode;
  className?: string;
  role?: string;
}) {
  const config = VARIANTS[variant];
  return (
    <div
      role={role ?? (variant === 'error' ? 'alert' : 'status')}
      className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm', config.classes, className)}
    >
      {config.icon}
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-sm opacity-90">{children}</div>}
      </div>
    </div>
  );
}
