import { describe, expect, it } from 'vitest';
import { describeActivity } from './activity';
import type { ActivityEntry } from '../features/projects/types';

function entry(overrides: Partial<ActivityEntry>): ActivityEntry {
  return {
    id: 'a1',
    action: 'PROJECT_UPDATED',
    field: null,
    oldValue: null,
    newValue: null,
    metadata: null,
    actor: { id: 'u1', displayName: 'Marvin' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('describeActivity', () => {
  it('renders project events', () => {
    expect(describeActivity(entry({ action: 'PROJECT_CREATED' }))).toBe('Marvin created the project');
    expect(
      describeActivity(
        entry({ action: 'PROJECT_STATUS_CHANGED', oldValue: 'Active', newValue: 'On Hold' }),
      ),
    ).toBe('Marvin changed the status from “Active” to “On Hold”');
  });

  it('renders member events with roles from metadata', () => {
    expect(
      describeActivity(
        entry({ action: 'MEMBER_ADDED', metadata: { displayName: 'John', projectRole: 'DEVELOPER' } }),
      ),
    ).toBe('Marvin added John as Developer');
    expect(
      describeActivity(
        entry({
          action: 'MEMBER_ROLE_CHANGED',
          oldValue: 'DEVELOPER',
          newValue: 'MANAGER',
          metadata: { displayName: 'John' },
        }),
      ),
    ).toBe('Marvin changed John from Developer to Manager');
  });

  it('renders milestone and label events', () => {
    expect(describeActivity(entry({ action: 'MILESTONE_COMPLETED', metadata: { name: 'MVP Release' } }))).toBe(
      'Marvin completed milestone “MVP Release”',
    );
    expect(describeActivity(entry({ action: 'LABEL_CREATED', metadata: { name: 'Frontend' } }))).toBe(
      'Marvin created label “Frontend”',
    );
  });

  it('renders task events including the task key', () => {
    expect(
      describeActivity(
        entry({
          action: 'TASK_STATUS_CHANGED',
          oldValue: 'In Progress',
          newValue: 'In Review',
          task: { id: 't1', key: 'DEV-142' },
        }),
      ),
    ).toBe('Marvin changed DEV-142 status from “In Progress” to “In Review”');

    expect(
      describeActivity(
        entry({ action: 'TASK_ASSIGNED', newValue: 'John', task: { id: 't1', key: 'DEV-142' } }),
      ),
    ).toBe('Marvin assigned DEV-142 to John');

    expect(
      describeActivity(
        entry({ action: 'TASK_CREATED', metadata: { key: 'DEV-143', title: 'Convert portal' } }),
      ),
    ).toBe('Marvin created DEV-143 “Convert portal”');

    expect(
      describeActivity(
        entry({
          action: 'TASK_UPDATED',
          metadata: { key: 'DEV-142', fields: ['estimatedHours', 'nextStep'] },
          task: { id: 't1', key: 'DEV-142' },
        }),
      ),
    ).toBe('Marvin updated estimatedHours, nextStep on DEV-142');
  });

  it('falls back to a readable sentence for unknown actions', () => {
    expect(describeActivity(entry({ action: 'DEPENDENCY_ADDED', actor: { id: null, displayName: 'System' } }))).toBe(
      'System performed dependency added',
    );
  });
});
