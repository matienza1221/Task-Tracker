import { describe, expect, it } from 'vitest';
import { applyOptimisticMove, filtersToSearchParams, findTask, resolveDropTarget, searchParamsToFilters, totalTasks } from './board';
import type { BoardColumn, Task } from './types';

function makeTask(overrides: Partial<Task> & { id: string; statusId: string }): Task {
  return {
    key: overrides.id.toUpperCase(),
    displayKey: overrides.id.toUpperCase(),
    number: 1,
    title: `Task ${overrides.id}`,
    description: null,
    project: { id: 'p1', code: 'WEBAPP', name: 'Web App' },
    parent: null,
    milestone: null,
    status: { id: overrides.statusId, key: 'TODO', name: 'To Do', category: 'TODO', color: '#8b5cf6' },
    priority: { id: 'pr1', key: 'MEDIUM', name: 'Medium', weight: 2, color: '#eab308' },
    type: { id: 'ty1', key: 'FEATURE', name: 'Feature', icon: 'sparkles', color: '#6366f1' },
    assignee: null,
    reporter: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    estimatedHours: null,
    actualHours: 0,
    progress: 0,
    progressMode: 'MANUAL',
    nextStep: null,
    verificationNote: null,
    codeReferences: [],
    labels: [],
    subtaskCount: 0,
    completedSubtaskCount: 0,
    isOverdue: false,
    blockedBy: [],
    isBlocked: false,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeBoard(): BoardColumn[] {
  return [
    {
      status: { id: 's1', key: 'TODO', name: 'To Do', category: 'TODO', color: '#8b5cf6' },
      tasks: [makeTask({ id: 't1', statusId: 's1' }), makeTask({ id: 't2', statusId: 's1' }), makeTask({ id: 't3', statusId: 's1' })],
    },
    {
      status: { id: 's2', key: 'IN_PROGRESS', name: 'In Progress', category: 'IN_PROGRESS', color: '#3b82f6' },
      tasks: [makeTask({ id: 't4', statusId: 's2' })],
    },
    {
      status: { id: 's3', key: 'DONE', name: 'Done', category: 'DONE', color: '#22c55e' },
      tasks: [],
    },
  ];
}

describe('resolveDropTarget', () => {
  it('computes the insertion index against siblings excluding the dragged card', () => {
    const board = makeBoard();
    // Move t3 above t1: siblings are [t1, t2], index of t1 is 0.
    expect(resolveDropTarget(board, 't3', 't1')).toEqual({ statusId: 's1', targetIndex: 0 });
    // Move t1 below t2: siblings are [t2, t3], index of t2 is 0.
    expect(resolveDropTarget(board, 't1', 't2')).toEqual({ statusId: 's1', targetIndex: 0 });
    // Move t1 onto t3: siblings are [t2, t3], index of t3 is 1.
    expect(resolveDropTarget(board, 't1', 't3')).toEqual({ statusId: 's1', targetIndex: 1 });
  });

  it('appends when dropped on a column body', () => {
    const board = makeBoard();
    expect(resolveDropTarget(board, 't1', 'column:s2')).toEqual({ statusId: 's2', targetIndex: 1 });
    expect(resolveDropTarget(board, 't1', 'column:s3')).toEqual({ statusId: 's3', targetIndex: 0 });
  });

  it('returns null for unknown cards or columns', () => {
    const board = makeBoard();
    expect(resolveDropTarget(board, 'ghost', 't1')).toBeNull();
    expect(resolveDropTarget(board, 't1', 'ghost')).toBeNull();
    expect(resolveDropTarget(board, 't1', 'column:nope')).toBeNull();
  });
});

describe('applyOptimisticMove', () => {
  it('reorders within a column', () => {
    const moved = applyOptimisticMove(makeBoard(), { taskId: 't3', statusId: 's1', targetIndex: 0 });
    expect(moved[0].tasks.map((task) => task.id)).toEqual(['t3', 't1', 't2']);
  });

  it('moves across columns and adopts the target status', () => {
    const moved = applyOptimisticMove(makeBoard(), { taskId: 't1', statusId: 's2', targetIndex: 0 });
    expect(moved[0].tasks.map((task) => task.id)).toEqual(['t2', 't3']);
    expect(moved[1].tasks.map((task) => task.id)).toEqual(['t1', 't4']);
    expect(moved[1].tasks[0].status.id).toBe('s2');
  });

  it('clamps the target index and ignores unknown tasks', () => {
    const clamped = applyOptimisticMove(makeBoard(), { taskId: 't4', statusId: 's3', targetIndex: 99 });
    expect(clamped[2].tasks.map((task) => task.id)).toEqual(['t4']);

    const untouched = applyOptimisticMove(makeBoard(), { taskId: 'ghost', statusId: 's1', targetIndex: 0 });
    expect(untouched[0].tasks.map((task) => task.id)).toEqual(['t1', 't2', 't3']);
  });

  it('keeps the original board array untouched (safe to snapshot for rollback)', () => {
    const board = makeBoard();
    applyOptimisticMove(board, { taskId: 't1', statusId: 's3', targetIndex: 0 });
    expect(board[0].tasks.map((task) => task.id)).toEqual(['t1', 't2', 't3']);
    expect(board[2].tasks).toHaveLength(0);
  });

  it('exposes helpers used by the board rendering', () => {
    const board = makeBoard();
    expect(totalTasks(board)).toBe(4);
    expect(findTask(board, 't4')?.id).toBe('t4');
    expect(findTask(board, 'ghost')).toBeUndefined();
  });
});

describe('filter serialisation', () => {
  it('round-trips filters through URL search params', () => {
    const filters = {
      q: 'portal',
      status: ['IN_PROGRESS'],
      priority: ['HIGH'],
      assignee: ['u1'],
      label: ['l1'],
      overdue: true,
      scope: 'mine' as const,
      includeCompleted: true,
      dueFrom: '2026-01-01',
      sort: '-priority',
    };

    const params = filtersToSearchParams(filters);
    expect(params.get('q')).toBe('portal');
    expect(params.get('status')).toBe('IN_PROGRESS');
    expect(params.get('mine')).toBe('true');

    const restored = searchParamsToFilters(params);
    expect(restored).toMatchObject({
      q: 'portal',
      status: ['IN_PROGRESS'],
      priority: ['HIGH'],
      assignee: ['u1'],
      label: ['l1'],
      overdue: true,
      scope: 'mine',
      includeCompleted: true,
      dueFrom: '2026-01-01',
      sort: '-priority',
    });
  });

  it('omits empty filters', () => {
    const params = filtersToSearchParams({});
    expect(params.toString()).toBe('');
  });
});
