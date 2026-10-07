import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { ChevronDownIcon } from './icons';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
  /** Shows a required marker and sets aria-required (native validation stays off). */
  required?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, id, className, options, placeholder, required, ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const describedBy =
    [error ? `${selectId}-error` : null, hint && !error ? `${selectId}-hint` : null].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className={cn(
            'block text-sm font-medium text-slate-700 dark:text-slate-300',
            required && "after:ml-0.5 after:text-red-500 after:content-['*']",
          )}
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          ref={ref}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'block w-full appearance-none rounded-lg border bg-white px-3 py-2 pr-9 text-sm text-slate-900 shadow-sm transition-colors',
            'focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40',
            'disabled:cursor-not-allowed disabled:bg-slate-100',
            'dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800',
            error ? 'border-red-500' : 'border-slate-300 dark:border-slate-700',
            className,
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute inset-y-0 right-3 my-auto text-base text-slate-400" />
      </div>
      {hint && !error && (
        <p id={`${selectId}-hint`} className="text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${selectId}-error`} role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
});
