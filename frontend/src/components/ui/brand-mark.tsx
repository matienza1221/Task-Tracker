import { useId } from 'react';
import { cn } from '../../lib/cn';

/** TeamBoard brand mark: indigo kanban board with a completed-task check. */
export function BrandMark({ className }: { className?: string }) {
  const gradientId = useId();

  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="TeamBoard"
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#bdbdf7" />
          <stop offset="1" stopColor="#6d5fd3" />
        </linearGradient>
      </defs>

      <rect width="64" height="64" rx="14" fill={`url(#${gradientId})`} />

      <g fill="#ffffff">
        <rect x="11" y="14" width="11" height="32" rx="3.5" />
        <rect x="26.5" y="14" width="11" height="32" rx="3.5" />
        <rect x="42" y="14" width="11" height="32" rx="3.5" />
      </g>

      <g fill={`url(#${gradientId})`}>
        <rect x="13" y="18" width="7" height="4" rx="2" />
        <rect x="13" y="25" width="7" height="4" rx="2" />
        <rect x="28.5" y="18" width="7" height="4" rx="2" />
        <rect x="28.5" y="25" width="7" height="4" rx="2" />
        <rect x="44" y="18" width="7" height="4" rx="2" />
        <rect x="44" y="25" width="7" height="4" rx="2" />
        <rect x="44" y="32" width="7" height="4" rx="2" />
      </g>

      <circle cx="47" cy="47" r="10" fill="#ffffff" />
      <path
        d="M42.4 47.3l3.2 3.2 6-6.6"
        fill="none"
        stroke="#6d5fd3"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
