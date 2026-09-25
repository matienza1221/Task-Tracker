import { describe, expect, it } from 'vitest';
import { unresolvedBlockers, type DependencyRef } from './types';

function dependency(overrides: Partial<DependencyRef> = {}): DependencyRef {
  return {
    id: 't1',
    key: 'DEV-1',
    title: 'Blocker',
    status: { name: 'In Progress', category: 'IN_PROGRESS', color: '#3b82f6' },
    project: { id: 'p1', code: 'DEV' },
    dueDate: null,
    ...overrides,
  };
}

describe('unresolvedBlockers', () => {
  it('keeps only dependencies that are not done or cancelled', () => {
    const list = [
      dependency({ id: 'a', status: { name: 'To Do', category: 'TODO', color: '#8b5cf6' } }),
      dependency({ id: 'b', status: { name: 'Done', category: 'DONE', color: '#22c55e' } }),
      dependency({ id: 'c', status: { name: 'Cancelled', category: 'CANCELLED', color: '#94a3b8' } }),
      dependency({ id: 'd', status: { name: 'Blocked', category: 'BLOCKED', color: '#ef4444' } }),
    ];
    expect(unresolvedBlockers(list).map((item) => item.id)).toEqual(['a', 'd']);
  });

  it('returns an empty list when everything is resolved', () => {
    expect(unresolvedBlockers([dependency({ status: { name: 'Done', category: 'DONE', color: '#22c55e' } })])).toEqual([]);
    expect(unresolvedBlockers([])).toEqual([]);
  });
});
