import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { BlockedBadge } from './BlockedBadge';
import type { Task } from '../../features/tasks/types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    key: 'DEV-2',
    displayKey: 'DEV-2',
    number: 2,
    title: 'Build client',
    description: null,
    project: { id: 'p1', code: 'DEV', name: 'Dev' },
    parent: null,
    milestone: null,
    status: { id: 's1', key: 'TODO', name: 'To Do', category: 'TODO', color: '#8b5cf6' },
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
    blockedBy: [],
    isBlocked: false,
    subtaskCount: 0,
    completedSubtaskCount: 0,
    isOverdue: false,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const blocker = {
  id: 'b1',
  key: 'DEV-1',
  title: 'Design API',
  status: { name: 'In Progress', category: 'IN_PROGRESS', color: '#3b82f6' },
  project: { id: 'p1', code: 'DEV' },
  dueDate: null,
};

describe('BlockedBadge', () => {
  it('renders nothing for an unblocked task', () => {
    const { container } = render(
      <MemoryRouter>
        <BlockedBadge task={makeTask()} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('names a single unfinished dependency', () => {
    render(
      <MemoryRouter>
        <BlockedBadge task={makeTask({ isBlocked: true, blockedBy: [blocker] })} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Waiting on DEV-1')).toBeInTheDocument();
  });

  it('summarises multiple unfinished dependencies', () => {
    render(
      <MemoryRouter>
        <BlockedBadge
          task={makeTask({
            isBlocked: true,
            blockedBy: [blocker, { ...blocker, id: 'b2', key: 'DEV-3', title: 'Wire API' }],
          })}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Waiting on 2 tasks')).toBeInTheDocument();
  });

  it('shows a plain blocked badge when the status itself is Blocked', () => {
    render(
      <MemoryRouter>
        <BlockedBadge
          task={makeTask({ status: { id: 's2', key: 'BLOCKED', name: 'Blocked', category: 'BLOCKED', color: '#ef4444' }, isBlocked: true })}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });

  it('ignores resolved dependencies', () => {
    const { container } = render(
      <MemoryRouter>
        <BlockedBadge
          task={makeTask({
            blockedBy: [{ ...blocker, status: { name: 'Done', category: 'DONE', color: '#22c55e' } }],
          })}
        />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
