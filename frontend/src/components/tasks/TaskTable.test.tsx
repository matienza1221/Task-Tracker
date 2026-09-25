import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TaskTable } from './TaskTable';
import type { Task } from '../../features/tasks/types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    key: 'WEBAPP-1',
    displayKey: 'WEBAPP-1',
    number: 1,
    title: 'Convert monitoring portal to React',
    description: null,
    project: { id: 'p1', code: 'WEBAPP', name: 'Web App' },
    parent: null,
    milestone: null,
    status: { id: 's1', key: 'IN_PROGRESS', name: 'In Progress', category: 'IN_PROGRESS', color: '#3b82f6' },
    priority: { id: 'pr1', key: 'HIGH', name: 'High', weight: 3, color: '#f97316' },
    type: { id: 'ty1', key: 'FEATURE', name: 'Feature', icon: 'sparkles', color: '#6366f1' },
    assignee: { id: 'u1', displayName: 'Dev Person', email: 'dev@example.com', avatarUrl: null },
    reporter: { id: 'u2', displayName: 'Manager', email: 'pm@example.com', avatarUrl: null },
    startDate: null,
    dueDate: '2026-09-30',
    completedAt: null,
    estimatedHours: 12,
    actualHours: 4,
    progress: 65,
    progressMode: 'MANUAL',
    nextStep: null,
    verificationNote: null,
    codeReferences: [],
    labels: [{ id: 'l1', name: 'Frontend', color: '#6366f1' }],
    subtaskCount: 5,
    completedSubtaskCount: 3,
    isOverdue: false,
    blockedBy: [],
    isBlocked: false,
    version: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderTable(tasks: Task[], showProject = false) {
  return render(
    <MemoryRouter>
      <TaskTable tasks={tasks} showProject={showProject} />
    </MemoryRouter>,
  );
}

describe('TaskTable', () => {
  it('renders task identity, badges, assignee, subtasks and progress', () => {
    renderTable([makeTask()]);

    expect(screen.getByText('WEBAPP-1')).toBeInTheDocument();
    expect(screen.getByText('Convert monitoring portal to React')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Dev Person')).toBeInTheDocument();
    expect(screen.getByText('3/5 subtasks')).toBeInTheDocument();
    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '65');
  });

  it('links to the task detail page', () => {
    renderTable([makeTask()]);
    const link = screen.getByRole('link', { name: /Convert monitoring portal to React/ });
    expect(link).toHaveAttribute('href', '/tasks/t1');
  });

  it('shows the project column only when requested', () => {
    renderTable([makeTask()], true);
    expect(screen.getByRole('link', { name: 'WEBAPP' })).toHaveAttribute('href', '/projects/p1');
  });

  it('marks overdue tasks and shows unassigned placeholders', () => {
    renderTable([
      makeTask({ isOverdue: true, assignee: null, dueDate: '2020-01-01' }),
      makeTask({ id: 't2', key: 'WEBAPP-2', displayKey: 'WEBAPP-2', title: 'Done work', status: { id: 's2', key: 'DONE', name: 'Done', category: 'DONE', color: '#22c55e' }, isOverdue: false }),
    ]);

    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('renders a message when there is nothing to show', () => {
    renderTable([]);
    expect(screen.getByText('No tasks match these filters.')).toBeInTheDocument();
  });
});
