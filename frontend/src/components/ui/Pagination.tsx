import { Button } from './Button';
import { cn } from '../../lib/cn';

export interface PaginationProps {
  page: number;
  totalPages: number;
  total?: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ page, totalPages, total, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <nav className={cn('flex items-center justify-between gap-3 text-sm', className)} aria-label="Pagination">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Page {page} of {totalPages}
        {typeof total === 'number' && ` · ${total} total`}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}
