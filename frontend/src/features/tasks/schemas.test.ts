import { describe, expect, it } from 'vitest';
import { parseCodeReferences, taskFormSchema } from './schemas';

const base = { title: 'Convert portal' };

describe('taskFormSchema', () => {
  it('accepts a minimal task and coerces numeric fields', () => {
    const result = taskFormSchema.safeParse({ ...base, estimatedHours: '12.5', actualHours: '3', progress: '40' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.estimatedHours).toBe(12.5);
    expect(result.success && result.data.actualHours).toBe(3);
    expect(result.success && result.data.progress).toBe(40);
  });

  it('requires a title of at least two characters', () => {
    expect(taskFormSchema.safeParse({ title: 'x' }).success).toBe(false);
    expect(taskFormSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a due date before the start date', () => {
    const result = taskFormSchema.safeParse({
      ...base,
      startDate: '2026-05-01',
      dueDate: '2026-01-01',
    });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].path).toEqual(['dueDate']);
  });

  it('rejects negative hours and out-of-range progress', () => {
    expect(taskFormSchema.safeParse({ ...base, estimatedHours: '-1' }).success).toBe(false);
    expect(taskFormSchema.safeParse({ ...base, progress: '140' }).success).toBe(false);
  });

  it('treats empty numeric inputs as undefined', () => {
    const result = taskFormSchema.safeParse({ ...base, estimatedHours: '', progress: '' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.estimatedHours).toBeUndefined();
    expect(result.success && result.data.progress).toBeUndefined();
  });
});

describe('parseCodeReferences', () => {
  it('splits lines, trims whitespace and drops blanks', () => {
    expect(parseCodeReferences('src/App.tsx:10-20\n\n  src/api/client.ts  \n')).toEqual([
      'src/App.tsx:10-20',
      'src/api/client.ts',
    ]);
  });

  it('returns an empty array for missing text', () => {
    expect(parseCodeReferences(undefined)).toEqual([]);
    expect(parseCodeReferences('')).toEqual([]);
  });
});
