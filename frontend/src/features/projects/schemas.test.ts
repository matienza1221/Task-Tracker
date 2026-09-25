import { describe, expect, it } from 'vitest';
import { addMemberFormSchema, labelFormSchema, milestoneFormSchema, projectFormSchema } from './schemas';

const baseProject = {
  code: 'WEBAPP',
  name: 'Customer Portal',
  description: '',
  statusId: '',
  priorityId: '',
  startDate: '',
  targetDate: '',
  managerId: '',
};

describe('projectFormSchema', () => {
  it('accepts valid input and normalises the code to uppercase', () => {
    const result = projectFormSchema.safeParse({ ...baseProject, code: 'webapp' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.code).toBe('WEBAPP');
  });

  it('rejects codes that do not start with a letter or are too long', () => {
    expect(projectFormSchema.safeParse({ ...baseProject, code: '1BAD' }).success).toBe(false);
    expect(projectFormSchema.safeParse({ ...baseProject, code: 'ABCDEFGHIJK' }).success).toBe(false);
  });

  it('rejects a target date before the start date', () => {
    const result = projectFormSchema.safeParse({
      ...baseProject,
      startDate: '2026-06-01',
      targetDate: '2026-01-01',
    });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].path).toEqual(['targetDate']);
  });

  it('rejects malformed dates', () => {
    expect(projectFormSchema.safeParse({ ...baseProject, startDate: '06/01/2026' }).success).toBe(false);
  });
});

describe('milestoneFormSchema', () => {
  it('requires a name and a known status', () => {
    expect(milestoneFormSchema.safeParse({ name: 'MVP', status: 'PLANNED' }).success).toBe(true);
    expect(milestoneFormSchema.safeParse({ name: 'M', status: 'PLANNED' }).success).toBe(false);
    expect(milestoneFormSchema.safeParse({ name: 'MVP', status: 'SHIPPED' }).success).toBe(false);
  });
});

describe('labelFormSchema', () => {
  it('enforces hex colours', () => {
    expect(labelFormSchema.safeParse({ name: 'Frontend', color: '#6366f1' }).success).toBe(true);
    expect(labelFormSchema.safeParse({ name: 'Frontend', color: 'blue' }).success).toBe(false);
  });
});

describe('addMemberFormSchema', () => {
  it('requires a uuid and a known project role', () => {
    expect(
      addMemberFormSchema.safeParse({
        userId: '11111111-1111-1111-1111-111111111111',
        projectRole: 'DEVELOPER',
      }).success,
    ).toBe(true);
    expect(addMemberFormSchema.safeParse({ userId: 'not-a-uuid', projectRole: 'DEVELOPER' }).success).toBe(false);
    expect(
      addMemberFormSchema.safeParse({
        userId: '11111111-1111-1111-1111-111111111111',
        projectRole: 'OWNER',
      }).success,
    ).toBe(false);
  });
});
