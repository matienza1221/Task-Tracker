import { describe, expect, it } from 'vitest';
import { formatRole, formatDateTime } from '../lib/format';
import { cn } from '../lib/cn';

describe('cn', () => {
  it('merges conditional classes and resolves Tailwind conflicts', () => {
    expect(cn('px-2', false && 'hidden', 'px-4')).toBe('px-4');
    expect(cn('text-sm', undefined, ['font-medium'])).toBe('text-sm font-medium');
  });
});

describe('format helpers', () => {
  it('renders role labels', () => {
    expect(formatRole('PROJECT_MANAGER')).toBe('Project Manager');
    expect(formatRole('UNKNOWN')).toBe('UNKNOWN');
  });

  it('renders placeholders for empty dates', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
  });
});
