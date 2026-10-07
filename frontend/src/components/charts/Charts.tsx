import { cn } from '../../lib/cn';
import { PASTEL } from '../../lib/palette';

export interface ChartPoint {
  label: string;
  value: number;
}

/**
 * Lightweight dependency-free charts. Each chart renders `role="img"` with a
 * descriptive `aria-label` containing the values, so screen readers get the
 * same information as the visual.
 */
function describe(title: string, points: ChartPoint[]): string {
  const parts = points.map((point) => `${point.label}: ${point.value}`).join(', ');
  return `${title}. ${parts}`;
}

export function LineChart({
  points,
  title,
  color = PASTEL.lavender,
  height = 160,
  className,
}: {
  points: ChartPoint[];
  title: string;
  color?: string;
  height?: number;
  className?: string;
}) {
  if (points.length === 0) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">No data for this period.</p>;
  }

  const width = 100;
  const max = Math.max(...points.map((point) => point.value), 1);
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points.map((point, index) => ({
    x: index * step,
    y: 100 - (point.value / max) * 100,
  }));
  const path = coords.map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x.toFixed(2)},${coord.y.toFixed(2)}`).join(' ');
  const labelEvery = Math.max(Math.ceil(points.length / 6), 1);

  return (
    <div className={cn('space-y-2', className)}>
      <svg
        role="img"
        aria-label={describe(title, points)}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ height }}
        className="w-full overflow-visible"
      >
        {[0, 25, 50, 75, 100].map((line) => (
          <line key={line} x1="0" y1={line} x2="100" y2={line} stroke="currentColor" strokeWidth="0.2" className="text-slate-200 dark:text-slate-700" />
        ))}
        <path d={path} fill="none" stroke={color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        {coords.map((coord, index) => (
          <circle key={index} cx={coord.x} cy={coord.y} r="0.8" fill={color} />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
        {points
          .filter((_, index) => index % labelEvery === 0 || index === points.length - 1)
          .map((point) => (
            <span key={point.label}>{point.label.slice(5)}</span>
          ))}
      </div>
      <p className="text-[10px] text-slate-400 dark:text-slate-500">Peak: {max}</p>
    </div>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

export function BarChart({ bars, title, className }: { bars: BarDatum[]; title?: string; className?: string }) {
  if (bars.length === 0) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">No data yet.</p>;
  }
  const max = Math.max(...bars.map((bar) => bar.value), 1);

  return (
    <div
      role="img"
      aria-label={title ? `${title}. ${bars.map((bar) => `${bar.label}: ${bar.value}`).join(', ')}` : bars.map((bar) => `${bar.label}: ${bar.value}`).join(', ')}
      className={cn('space-y-2', className)}
    >
      {bars.map((bar) => (
        <div key={bar.label} className="space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
            <span className="truncate">{bar.label}</span>
            <span className="tabular-nums">{bar.value}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full"
              style={{ width: `${(bar.value / max) * 100}%`, backgroundColor: bar.color ?? PASTEL.lavender }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DonutChart({
  slices,
  title,
  size = 140,
  className,
}: {
  slices: BarDatum[];
  title: string;
  size?: number;
  className?: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total === 0) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">No data yet.</p>;
  }

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className={cn('flex flex-wrap items-center gap-4', className)}>
      <svg
        role="img"
        aria-label={title ? `${title}. ${slices.map((slice) => `${slice.label}: ${slice.value}`).join(', ')}` : slices.map((slice) => `${slice.label}: ${slice.value}`).join(', ')}
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className="shrink-0"
      >
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="16" stroke="currentColor" className="text-slate-100 dark:text-slate-800" />
        {slices.map((slice) => {
          const length = (slice.value / total) * circumference;
          const circle = (
            <circle
              key={slice.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeWidth="16"
              stroke={slice.color ?? PASTEL.lavender}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 50 50)"
            />
          );
          offset += length;
          return circle;
        })}
        <text x="50" y="54" textAnchor="middle" className="fill-slate-700 text-[14px] font-semibold dark:fill-slate-100">
          {total}
        </text>
      </svg>
      <ul className="space-y-1 text-xs">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: slice.color ?? PASTEL.lavender }} />
            <span className="min-w-[90px]">{slice.label}</span>
            <span className="tabular-nums text-slate-500 dark:text-slate-400">
              {slice.value} · {Math.round((slice.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
