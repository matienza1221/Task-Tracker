import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-100 px-4 text-center dark:bg-slate-950">
      <p className="text-5xl font-bold text-slate-300 dark:text-slate-700">404</p>
      <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Page not found</h1>
      <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
        The page you requested does not exist or you no longer have access to it.
      </p>
      <Link
        to="/dashboard"
        className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
