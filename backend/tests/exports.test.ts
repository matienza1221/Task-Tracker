import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { csvCell, exportProjectCsv } from '../src/modules/exports/service';
import { authed } from './helpers/auth';
import { createProjectFixture, createTaskFixture } from './helpers/db';
import { createUserWithSession } from './helpers/scenarios';

describe('csvCell', () => {
  it('quotes separators and doubles embedded quotes', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('has, comma')).toBe('"has, comma"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
  });

  it('neutralises spreadsheet formula injection', () => {
    expect(csvCell('=cmd|calc')).toBe("'=cmd|calc");
    expect(csvCell('+1234')).toBe("'+1234");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('=cmd,with comma')).toBe('"\'=cmd,with comma"');
  });
});

describe('project CSV export', () => {
  it('exports tasks with labels, milestones and dependencies', async () => {
    const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const developer = await createUserWithSession(app, { email: 'dev@example.com', globalRole: 'DEVELOPER' });
    const project = await createProjectFixture({ manager: pm.user, code: 'EXP' });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: developer.user.id, projectRole: 'DEVELOPER' } });

    const milestone = await prisma.milestone.create({ data: { projectId: project.id, name: 'MVP' } });
    const label = await prisma.label.create({ data: { projectId: project.id, name: 'Frontend' } });
    const blocker = await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Design API' });
    const task = await createTaskFixture({
      projectId: project.id,
      reporter: pm.user,
      title: '=SUM(A1:A2)',
      assigneeId: developer.user.id,
      milestoneId: milestone.id,
      estimatedHours: 8,
      dueDate: '2026-07-01',
      progress: 40,
    });
    await prisma.taskLabel.create({ data: { taskId: task.id, labelId: label.id } });
    await authed(app, pm.client).post(`/api/tasks/${task.id}/dependencies`).send({ dependsOnTaskId: blocker.id });

    const response = await authed(app, developer.client).get(`/api/projects/${project.id}/export.csv`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment;');

    // The final newline produces a trailing empty element.
    const lines = (response.text ?? '').split('\n').filter((line) => line.length > 0);
    expect(lines[0]).toBe(
      'Task key,Title,Labels,Assignee,Priority,Status,Type,Start date,Due date,Completed date,Estimated hours,Actual hours,Progress %,Parent,Milestone,Blocked by,Next step / blocker,Verification note,Code references,Reporter,Created,Updated',
    );
    expect(lines).toHaveLength(3); // header + 2 tasks

    const formulaRow = lines.find((line) => line.includes('SUM'));
    expect(formulaRow).toBeTruthy();
    // Formula-looking titles are prefixed so spreadsheets keep them literal.
    expect(formulaRow).toContain("'=SUM(A1:A2)");
    expect(formulaRow).toContain('Frontend');
    expect(formulaRow).toContain('Test User'); // the developer session's display name
    expect(formulaRow).toContain('MVP');
    expect(formulaRow).toContain('EXP-1'); // blocked-by key
    expect(formulaRow).toContain('2026-07-01');
    expect(formulaRow).toContain('40');
    expect(lines.find((line) => line.includes('Design API'))).toContain('EXP-1,');
  });

  it('includes subtasks with their parent key', async () => {
    const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const project = await createProjectFixture({ manager: pm.user, code: 'SUB' });
    const parent = await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Parent task' });
    await createTaskFixture({ projectId: project.id, reporter: pm.user, title: 'Child task', parentTaskId: parent.id });

    const response = await authed(app, pm.client).get(`/api/projects/${project.id}/export.csv`);
    const lines = (response.text ?? '').split('\n').filter((line) => line.length > 0);
    expect(lines[2]).toContain('Child task');
    expect(lines[2]).toContain('SUB-1');
  });

  it('enforces export permissions and project visibility', async () => {
    const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const viewer = await createUserWithSession(app, { email: 'viewer@example.com', globalRole: 'VIEWER' });
    const outsider = await createUserWithSession(app, { email: 'outsider@example.com', globalRole: 'PROJECT_MANAGER' });
    const project = await createProjectFixture({ manager: pm.user, code: 'GUARD' });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: viewer.user.id, projectRole: 'VIEWER' } });
    await createTaskFixture({ projectId: project.id, reporter: pm.user });

    expect((await authed(app, pm.client).get(`/api/projects/${project.id}/export.csv`)).status).toBe(200);
    // Viewers hold report access but not export:run.
    expect((await authed(app, viewer.client).get(`/api/projects/${project.id}/export.csv`)).status).toBe(403);
    expect((await authed(app, outsider.client).get(`/api/projects/${project.id}/export.csv`)).status).toBe(404);
  });

  it('is callable directly as a service', async () => {
    const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const project = await createProjectFixture({ manager: pm.user, code: 'SVC' });
    const csv = await exportProjectCsv(pm.user, project.id);
    expect(csv.split('\n')[0]).toContain('Task key');
  });
});
