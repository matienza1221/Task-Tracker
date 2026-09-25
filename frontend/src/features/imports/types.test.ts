import { describe, expect, it } from 'vitest';
import { suggestMapping } from './types';

describe('suggestMapping', () => {
  it('maps the reference spreadsheet headers onto target fields', () => {
    const mapping = suggestMapping([
      'Area',
      'Task',
      'Owner',
      'Priority',
      'Status',
      'Due date',
      'Completed date',
      'Blocker / next step',
      'Reference link',
    ]);

    expect(mapping).toMatchObject({
      area: 'Area',
      title: 'Task',
      assignee: 'Owner',
      priority: 'Priority',
      status: 'Status',
      dueDate: 'Due date',
      completedDate: 'Completed date',
      nextStep: 'Blocker / next step',
      codeReferences: 'Reference link',
    });
  });

  it('handles common alternative header names', () => {
    const mapping = suggestMapping(['Summary', 'Assignee', 'State', 'Deadline', 'Estimate (h)', 'Files']);
    expect(mapping).toMatchObject({
      title: 'Summary',
      assignee: 'Assignee',
      status: 'State',
      dueDate: 'Deadline',
      estimatedHours: 'Estimate (h)',
      codeReferences: 'Files',
    });
  });

  it('never maps the same column twice', () => {
    const mapping = suggestMapping(['Task', 'Task']);
    const values = Object.values(mapping).filter(Boolean);
    expect(new Set(values).size).toBe(values.length);
  });

  it('leaves unknown headers unmapped', () => {
    const mapping = suggestMapping(['Column 1', 'Column 2']);
    expect(Object.values(mapping).filter(Boolean)).toHaveLength(0);
  });
});
