import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { taskKeys, useMoveTask } from './queries';
import type { BoardColumn, Task } from './types';

vi.mock('./api', () => ({
  fetchProjectTasks: vi.fn(),
  fetchMyTasks: vi.fn(),
  fetchTask: vi.fn(),
  fetchBoard: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateTaskAssignee: vi.fn(),
  createSubtask: vi.fn(),
  deleteTask: vi.fn(),
  fetchTaskActivity: vi.fn(),
  moveTask: vi.fn(),
  bulkUpdateTasks: vi.fn(),
}));

const { moveTask } = await import('./api');
const mockedMoveTask = vi.mocked(moveTask);

function makeTask(id: string, statusId: string): Task {
  return {
    id,
    key: id.toUpperCase(),
    displayKey: id.toUpperCase(),
    number: 1,
    title: `Task ${id}`,
    description: null,
    project: { id: 'p1', code: 'WEBAPP', name: 'Web App' },
    parent: null,
    milestone: null,
    status: { id: statusId, key: 'TODO', name: 'To Do', category: 'TODO', color: '#8b5cf6' },
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
  };
}

const BOARD = {
  columns: [
    { status: { id: 's1', key: 'TODO', name: 'To Do', category: 'TODO', color: '#8b5cf6' }, tasks: [makeTask('t1', 's1'), makeTask('t2', 's1')] },
    { status: { id: 's2', key: 'DONE', name: 'Done', category: 'DONE', color: '#22c55e' }, tasks: [] as Task[] },
  ] as BoardColumn[],
  totalTasks: 2,
  truncated: false,
};

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const filters = {};
  queryClient.setQueryData(taskKeys.board('p1', filters), BOARD);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, filters, wrapper };
}

describe('useMoveTask', () => {
  it('applies the move optimistically before the server answers', async () => {
    const { queryClient, filters, wrapper } = setup();
    let resolveMove: (value: { task: Task }) => void = () => undefined;
    mockedMoveTask.mockImplementation(() => new Promise((resolve) => {
      resolveMove = resolve;
    }));

    const { result } = renderHook(() => useMoveTask('p1'), { wrapper });

    act(() => {
      result.current.mutate({ taskId: 't1', statusId: 's2', targetIndex: 0, version: 1 });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<typeof BOARD>(taskKeys.board('p1', filters));
      expect(cached?.columns[1].tasks.map((task) => task.id)).toEqual(['t1']);
      expect(cached?.columns[0].tasks.map((task) => task.id)).toEqual(['t2']);
    });

    resolveMove({ task: makeTask('t1', 's2') });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls the board back when the server rejects the move', async () => {
    const { queryClient, filters, wrapper } = setup();
    mockedMoveTask.mockRejectedValue(Object.assign(new Error('Conflict'), { status: 409 }));

    const { result } = renderHook(() => useMoveTask('p1'), { wrapper });

    act(() => {
      result.current.mutate({ taskId: 't1', statusId: 's2', targetIndex: 0, version: 1 });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<typeof BOARD>(taskKeys.board('p1', filters));
    expect(cached?.columns[0].tasks.map((task) => task.id)).toEqual(['t1', 't2']);
    expect(cached?.columns[1].tasks).toHaveLength(0);
  });

  it('sends the resolved payload to the API', async () => {
    const { wrapper } = setup();
    mockedMoveTask.mockResolvedValue({ task: makeTask('t1', 's2') });

    const { result } = renderHook(() => useMoveTask('p1'), { wrapper });
    act(() => {
      result.current.mutate({ taskId: 't1', statusId: 's2', targetIndex: 0, version: 7 });
    });

    await waitFor(() => expect(mockedMoveTask).toHaveBeenCalled());
    expect(mockedMoveTask).toHaveBeenCalledWith('t1', { statusId: 's2', targetIndex: 0, version: 7 });
  });
});
