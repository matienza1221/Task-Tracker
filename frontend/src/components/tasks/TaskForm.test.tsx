import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TaskForm } from './TaskForm';
import type { Task } from '../../features/tasks/types';

vi.mock('../../features/tasks/api', () => ({
  fetchProjectTasks: vi.fn(),
  fetchMyTasks: vi.fn(),
  fetchTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateTaskAssignee: vi.fn(),
  createSubtask: vi.fn(),
  deleteTask: vi.fn(),
  fetchTaskActivity: vi.fn(),
}));

vi.mock('../../features/meta/queries', () => ({
  useVocabularies: () => ({
    data: {
      projectStatuses: [],
      taskStatuses: [
        { id: 's1', key: 'TODO', name: 'To Do', color: '#8b5cf6', isDefault: true, category: 'TODO' },
        { id: 's2', key: 'DONE', name: 'Done', color: '#22c55e', isDefault: false, category: 'DONE' },
      ],
      taskPriorities: [{ id: 'p1', key: 'MEDIUM', name: 'Medium', color: '#eab308', isDefault: true, weight: 2 }],
      taskTypes: [{ id: 'ty1', key: 'FEATURE', name: 'Feature', color: '#6366f1', isDefault: true, icon: 'sparkles' }],
    },
    isLoading: false,
  }),
}));

vi.mock('../../features/projects/queries', () => ({
  useLabels: () => ({
    data: {
      labels: [
        { id: 'l1', projectId: 'p1', name: 'Frontend', color: '#6366f1', isGlobal: false, createdAt: '' },
        { id: 'l2', projectId: null, name: 'Global', color: '#22c55e', isGlobal: true, createdAt: '' },
      ],
    },
  }),
  useMembers: () => ({
    data: {
      members: [
        {
          userId: 'u1',
          displayName: 'Dev Person',
          email: 'dev@example.com',
          avatarUrl: null,
          globalRole: 'DEVELOPER',
          projectRole: 'DEVELOPER',
          isProjectManager: false,
          addedBy: null,
          createdAt: '',
        },
      ],
    },
  }),
  useMilestones: () => ({ data: { milestones: [{ id: 'm1', projectId: 'p1', name: 'MVP', description: null, targetDate: null, status: 'PLANNED', completedAt: null, sortOrder: 0, createdAt: '', updatedAt: '' }] } }),
}));

const { createTask } = await import('../../features/tasks/api');
const mockedCreateTask = vi.mocked(createTask);

const CREATED_TASK = {
  id: 't1',
  key: 'WEBAPP-1',
  displayKey: 'WEBAPP-1',
  number: 1,
  title: 'Convert portal',
  description: null,
  project: { id: 'p1', code: 'WEBAPP', name: 'Web App' },
  parent: null,
  milestone: null,
  status: { id: 's1', key: 'TODO', name: 'To Do', category: 'TODO', color: '#8b5cf6' },
  priority: { id: 'p1', key: 'MEDIUM', name: 'Medium', weight: 2, color: '#eab308' },
  type: { id: 'ty1', key: 'FEATURE', name: 'Feature', icon: 'sparkles', color: '#6366f1' },
  assignee: null,
  reporter: null,
  startDate: null,
  dueDate: null,
  completedAt: null,
  estimatedHours: null,
  actualHours: 0,
  progress: 0,
  progressMode: 'MANUAL' as const,
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
} satisfies Task;

/** Opens a DatePicker and clicks the given day in the month it shows. */
async function pickDay(user: ReturnType<typeof userEvent.setup>, label: string, day: number) {
  await user.click(screen.getByLabelText(label));
  const suffix =
    day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  await user.click(screen.getByRole('button', { name: new RegExp(`\\b${day}${suffix}, \\d{4}$`) }));
}

function renderForm(onSuccess = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TaskForm projectId="p1" onSuccess={onSuccess} onCancel={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onSuccess };
}

describe('TaskForm', () => {
  it('requires a title', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Create task' }));

    expect(await screen.findByText('Task title is required.')).toBeInTheDocument();
    expect(mockedCreateTask).not.toHaveBeenCalled();
  });

  it('creates a task with parsed code references, labels and hours', async () => {
    const user = userEvent.setup();
    const { onSuccess } = renderForm();
    mockedCreateTask.mockResolvedValue({ task: CREATED_TASK });

    await user.type(screen.getByLabelText('Title'), 'Convert portal');
    await user.click(screen.getByRole('button', { name: '+ More options' }));
    await user.type(screen.getByLabelText('Estimated hours'), '12.5');
    await user.click(screen.getByRole('button', { name: 'Frontend' }));
    await user.type(screen.getByLabelText('Code references'), 'src/App.tsx:10-20{enter}src/api/client.ts');
    await user.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() => expect(mockedCreateTask).toHaveBeenCalledTimes(1));
    const [projectId, payload] = mockedCreateTask.mock.calls[0];
    expect(projectId).toBe('p1');
    expect(payload.title).toBe('Convert portal');
    expect(payload.estimatedHours).toBe(12.5);
    expect(payload.codeReferences).toEqual(['src/App.tsx:10-20', 'src/api/client.ts']);
    expect(payload.labelIds).toEqual(['l1']);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('blocks a due date before the start date', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Title'), 'Scheduling test');
    await user.click(screen.getByRole('button', { name: '+ More options' }));
    await pickDay(user, 'Start date', 15);
    await pickDay(user, 'Due date', 10);
    await user.click(screen.getByRole('button', { name: 'Create task' }));

    expect(await screen.findByText('Due date cannot be before the start date.')).toBeInTheDocument();
    expect(mockedCreateTask).not.toHaveBeenCalled();
  });
});
