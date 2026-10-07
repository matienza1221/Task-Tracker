import type { ReactNode } from 'react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export function AuthLayout({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  useDocumentTitle(title);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white"
          >
            TB
          </span>
          <div>
            <p className="text-base font-semibold text-slate-900 dark:text-white">TeamBoard</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Development task management</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-6 space-y-1">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h1>
            {description && <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>}
          </div>
          {children}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
          Internal tool — accounts are created by an administrator.
        </p>
      </div>
    </div>
  );
}
