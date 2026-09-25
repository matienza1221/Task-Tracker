import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/db/prisma';
import { authed } from './helpers/auth';
import { createProjectFixture, createTestUser } from './helpers/db';
import { createUserWithSession } from './helpers/scenarios';

/** The reference spreadsheet's exact column layout. */
const REFERENCE_CSV = [
  'Area,Task,Owner,Priority,Status,Due date,Completed date,Blocker / next step,Reference link',
  ',Add Completed Meetings summary card (values hidden by default),,Medium,Done,,,Verified,"Universe.jsx:55-68; school.service.js:266-274"',
  'Meetings,Add Rescheduled Meetings summary card,,Medium,Done,,,Verified,Universe.jsx:68',
  'Calendar,Block picking past dates/times,,High,Done,,,Verified,"modals.jsx:408-410,874-875"',
  'AI Research,Show Product Matching %,,High,In progress,2026-10-15,,Column exists but has no data source,"components.jsx:228,747"',
].join('\n');

const MAPPING = {
  title: 'Task',
  area: 'Area',
  assignee: 'Owner',
  priority: 'Priority',
  status: 'Status',
  dueDate: 'Due date',
  completedDate: 'Completed date',
  nextStep: 'Blocker / next step',
  codeReferences: 'Reference link',
};

async function adminWithProject() {
  const admin = await createUserWithSession(app, { email: 'admin@example.com', globalRole: 'ADMIN' });
  const project = await createProjectFixture({ manager: admin.user, code: 'MIG' });
  return { admin, project };
}

function uploadCsv(client: Awaited<ReturnType<typeof createUserWithSession>>['client'], content: string, filename = 'tracker.csv') {
  return authed(app, client)
    .post('/api/admin/imports')
    .attach('file', Buffer.from(content, 'utf8'), filename);
}

describe('spreadsheet import', () => {
  it('parses a CSV upload and stores the raw rows', async () => {
    const { admin } = await adminWithProject();

    const response = await uploadCsv(admin.client, REFERENCE_CSV);

    expect(response.status).toBe(201);
    expect(response.body.data.headers).toEqual([
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
    expect(response.body.data.rowCount).toBe(4);
    expect(response.body.data.sampleRows[0][1]).toContain('Add Completed Meetings summary card');

    const job = await prisma.importJob.findUniqueOrThrow({ where: { id: response.body.data.job.id } });
    expect(job.sourceFormat).toBe('CSV');
    expect(await prisma.importRow.count({ where: { jobId: job.id } })).toBe(4);
  });

  it('ignores placeholder values in the reference column', async () => {
    const { admin, project } = await adminWithProject();
    const csv = ['Task,Reference link', 'With refs,rules.js:1078-1122; components.jsx:228', 'No refs,-'].join('\n');
    const created = await uploadCsv(admin.client, csv);
    const jobId = created.body.data.job.id;

    await authed(app, admin.client)
      .post(`/api/admin/imports/${jobId}/commit`)
      .send({ projectId: project.id, mapping: { title: 'Task', codeReferences: 'Reference link' } });

    const tasks = await prisma.task.findMany({ where: { projectId: project.id }, orderBy: { number: 'asc' } });
    expect(tasks[0].codeReferences).toEqual(['rules.js:1078-1122', 'components.jsx:228']);
    expect(tasks[1].codeReferences).toEqual([]);
  });

  it('detects the header row below the reference sheet’s title and KPI preamble', async () => {
    const { admin, project } = await adminWithProject();
    const csv = [
      ',,,,,,,,',
      'Web app development task tracker,,,,,,,,',
      'Replace or delete rows marked [Example]. Add one row per task.,,,,,,,,',
      ',,,,,,,,',
      'Total tasks,Completed,Blocked,Overdue,Due next 7 days,Completion,,,',
      '31,23,0,0,0,74%,,,',
      ',,,,,,,,',
      ',,,,,,,,',
      'Area,Task,Owner,Priority,Status,Due date,Completed date,Blocker / next step,Reference link',
      ',Add Completed Meetings summary card,,Medium,Done,,,Verified,Universe.jsx:55-68',
      'Meetings,Add Rescheduled Meetings summary card,,Medium,Done,,,Verified,Universe.jsx:68',
    ].join('\n');

    const created = await uploadCsv(admin.client, csv);
    expect(created.status).toBe(201);
    expect(created.body.data.headerRowNumber).toBe(9);
    expect(created.body.data.preambleRows).toBe(8);
    expect(created.body.data.headers[0]).toBe('Area');
    expect(created.body.data.rowCount).toBe(2);

    const preview = await authed(app, admin.client)
      .post(`/api/admin/imports/${created.body.data.job.id}/preview`)
      .send({ projectId: project.id, mapping: MAPPING });
    expect(preview.body.data.summary).toMatchObject({ valid: 2, invalid: 0 });
    // Row numbers match the original spreadsheet lines.
    expect(preview.body.data.preview[0].rowNumber).toBe(10);
  });

  it('parses an XLSX upload', async () => {
    const { admin } = await adminWithProject();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Tracker');
    sheet.addRow(['Area', 'Task', 'Priority', 'Status']);
    sheet.addRow(['Meetings', 'Add summary card', 'Medium', 'Done']);
    sheet.addRow(['Calendar', 'Block past dates', 'High', 'To do']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const response = await authed(app, admin.client)
      .post('/api/admin/imports')
      .attach('file', buffer, 'tracker.xlsx');

    expect(response.status).toBe(201);
    expect(response.body.data.job.sourceFormat).toBe('XLSX');
    expect(response.body.data.rowCount).toBe(2);
  });

  it('previews a mapping, validating every row and reporting errors', async () => {
    const { admin, project } = await adminWithProject();
    const created = await uploadCsv(admin.client, REFERENCE_CSV);
    const jobId = created.body.data.job.id;

    const preview = await authed(app, admin.client)
      .post(`/api/admin/imports/${jobId}/preview`)
      .send({ projectId: project.id, mapping: MAPPING });

    expect(preview.status).toBe(200);
    expect(preview.body.data.summary).toMatchObject({ rowCount: 4, valid: 4, invalid: 0, duplicates: 0 });
    expect(preview.body.data.summary.labelsToCreate.sort()).toEqual(['AI Research', 'Calendar', 'Meetings']);
    expect(preview.body.data.preview[0].normalized).toMatchObject({
      title: 'Add Completed Meetings summary card (values hidden by default)',
      codeReferences: ['Universe.jsx:55-68', 'school.service.js:266-274'],
    });
    // "Verified" is a verification note, not a blocker.
    expect(preview.body.data.preview[0].normalized.verificationNote).toBe('Verified');
    expect(preview.body.data.preview[0].normalized.nextStep).toBeNull();

    // The 4th row's blocker text becomes nextStep and its status is In Progress.
    const fourth = preview.body.data.preview[3].normalized;
    expect(fourth.nextStep).toContain('Column exists but has no data source');
    expect(fourth.dueDate).toBe('2026-10-15');
  });

  it('flags invalid rows with actionable errors instead of dropping them', async () => {
    const { admin, project } = await adminWithProject();
    const csv = [
      'Task,Status,Priority,Owner,Due date',
      'Good row,Done,High,,2026-01-01',
      ',Done,High,,', // missing title
      'Bad status,Nope,High,,', // unknown status
      'Bad date,Done,High,,31/12/2026', // ambiguous date format
      'Unknown owner,Done,High,ghost@example.com,', // not a project member
    ].join('\n');
    const created = await uploadCsv(admin.client, csv);
    const jobId = created.body.data.job.id;

    const preview = await authed(app, admin.client)
      .post(`/api/admin/imports/${jobId}/preview`)
      .send({
        projectId: project.id,
        mapping: { title: 'Task', status: 'Status', priority: 'Priority', assignee: 'Owner', dueDate: 'Due date' },
      });

    expect(preview.body.data.summary).toMatchObject({ rowCount: 5, valid: 1, invalid: 4 });
    const errors = preview.body.data.errors.flatMap((row: { errors: { path: string; message: string }[] }) => row.errors);
    expect(errors.some((error: { message: string }) => error.message.includes('title is required'))).toBe(true);
    expect(errors.some((error: { message: string }) => error.message.includes('Unknown status'))).toBe(true);
    expect(errors.some((error: { message: string }) => error.message.includes('Could not read'))).toBe(true);
    expect(errors.some((error: { message: string }) => error.message.includes('not a member'))).toBe(true);
  });

  it('commits valid rows into tasks, labels and activity', async () => {
    const { admin, project } = await adminWithProject();
    const created = await uploadCsv(admin.client, REFERENCE_CSV);
    const jobId = created.body.data.job.id;
    const input = { projectId: project.id, mapping: MAPPING };

    await authed(app, admin.client).post(`/api/admin/imports/${jobId}/preview`).send(input);
    const commit = await authed(app, admin.client).post(`/api/admin/imports/${jobId}/commit`).send(input);

    expect(commit.status).toBe(200);
    expect(commit.body.data.summary).toMatchObject({ imported: 4, invalid: 0 });
    expect(commit.body.data.alreadyCommitted).toBe(false);

    const tasks = await prisma.task.findMany({
      where: { projectId: project.id },
      include: { status: true, priority: true, labels: { include: { label: true } } },
      orderBy: { number: 'asc' },
    });
    expect(tasks).toHaveLength(4);
    expect(tasks.map((task) => task.key)).toEqual(['MIG-1', 'MIG-2', 'MIG-3', 'MIG-4']);
    expect(tasks[0].status.category).toBe('DONE');
    expect(tasks[0].completedAt).not.toBeNull();
    expect(tasks[0].progress).toBe(100);
    // The first reference row has no Area, so only rows 2-4 carry labels.
    expect(tasks[0].labels).toHaveLength(0);
    expect(tasks[1].labels.map((entry) => entry.label.name)).toContain('Meetings');
    expect(tasks[3].status.category).toBe('IN_PROGRESS');
    expect(tasks[3].dueDate?.toISOString().slice(0, 10)).toBe('2026-10-15');
    expect(tasks[3].codeReferences).toEqual(['components.jsx:228,747']);
    // "Verified" cells land on the verification note, not the blocker field.
    expect(tasks[0].verificationNote).toBe('Verified');
    expect(tasks[0].nextStep).toBeNull();
    expect(tasks[3].nextStep).toContain('no data source');

    // Labels are created per project and reused.
    const labels = await prisma.label.findMany({ where: { projectId: project.id } });
    expect(labels.map((label) => label.name).sort()).toEqual(['AI Research', 'Calendar', 'Meetings']);

    expect(await prisma.activityLog.count({ where: { projectId: project.id, action: 'IMPORT_COMMITTED' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'IMPORT_COMMITTED', resourceId: jobId } })).toBeGreaterThanOrEqual(2);

    const job = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe('COMMITTED');
    expect(job.committedAt).not.toBeNull();
    expect(await prisma.importRow.count({ where: { jobId, status: 'IMPORTED' } })).toBe(4);
  });

  it('is idempotent: committing twice creates nothing new', async () => {
    const { admin, project } = await adminWithProject();
    const created = await uploadCsv(admin.client, REFERENCE_CSV);
    const jobId = created.body.data.job.id;
    const input = { projectId: project.id, mapping: MAPPING };

    await authed(app, admin.client).post(`/api/admin/imports/${jobId}/commit`).send(input);
    const second = await authed(app, admin.client).post(`/api/admin/imports/${jobId}/commit`).send(input);

    expect(second.status).toBe(200);
    expect(second.body.data.alreadyCommitted).toBe(true);
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(4);
  });

  it('skips duplicate rows in the file and existing titles, unless told not to', async () => {
    const { admin, project } = await adminWithProject();
    const csv = ['Task,Status', 'Repeated row,Done', 'Repeated row,Done', 'Brand new,To do'].join('\n');
    const created = await uploadCsv(admin.client, csv);
    const jobId = created.body.data.job.id;
    const input = { projectId: project.id, mapping: { title: 'Task', status: 'Status' } };

    const preview = await authed(app, admin.client).post(`/api/admin/imports/${jobId}/preview`).send(input);
    expect(preview.body.data.summary).toMatchObject({ valid: 2, duplicates: 1 });

    await authed(app, admin.client).post(`/api/admin/imports/${jobId}/commit`).send(input);
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(2);

    // Re-importing the same file into the same project skips the existing titles.
    const second = await uploadCsv(admin.client, csv);
    const secondPreview = await authed(app, admin.client)
      .post(`/api/admin/imports/${second.body.data.job.id}/preview`)
      .send(input);
    expect(secondPreview.body.data.summary).toMatchObject({ valid: 0, duplicates: 3 });

    const allowDuplicates = await authed(app, admin.client)
      .post(`/api/admin/imports/${second.body.data.job.id}/preview`)
      .send({ ...input, skipDuplicates: false });
    expect(allowDuplicates.body.data.summary).toMatchObject({ valid: 2, duplicates: 1 });
  });

  it('requires the import:run permission and a file', async () => {
    const { admin, project } = await adminWithProject();
    const pm = await createUserWithSession(app, { email: 'pm@example.com', globalRole: 'PROJECT_MANAGER' });
    const created = await uploadCsv(admin.client, REFERENCE_CSV);
    const jobId = created.body.data.job.id;

    expect((await authed(app, pm.client).get('/api/admin/imports')).status).toBe(403);
    expect(
      (
        await authed(app, pm.client)
          .post(`/api/admin/imports/${jobId}/preview`)
          .send({ projectId: project.id, mapping: MAPPING })
      ).status,
    ).toBe(403);

    const noFile = await authed(app, admin.client).post('/api/admin/imports');
    expect(noFile.status).toBe(422);

    const emptyFile = await uploadCsv(admin.client, 'Task,Status');
    expect(emptyFile.status).toBe(422);

    const unknownJob = await authed(app, admin.client)
      .post('/api/admin/imports/11111111-1111-1111-1111-111111111111/preview')
      .send({ projectId: project.id, mapping: MAPPING });
    expect(unknownJob.status).toBe(404);
  });

  it('lists jobs and exposes row statuses', async () => {
    const { admin, project } = await adminWithProject();
    const created = await uploadCsv(admin.client, REFERENCE_CSV);
    const jobId = created.body.data.job.id;
    await authed(app, admin.client).post(`/api/admin/imports/${jobId}/commit`).send({ projectId: project.id, mapping: MAPPING });

    const list = await authed(app, admin.client).get('/api/admin/imports');
    expect(list.status).toBe(200);
    expect(list.body.data.imports).toHaveLength(1);
    expect(list.body.data.imports[0]).toMatchObject({ id: jobId, status: 'COMMITTED' });

    const job = await authed(app, admin.client).get(`/api/admin/imports/${jobId}?pageSize=2`);
    expect(job.status).toBe(200);
    expect(job.body.data.counts).toMatchObject({ IMPORTED: 4 });
    expect(job.body.data.rows).toHaveLength(2);
    expect(job.body.meta.total).toBe(4);
  });

  it('assigns imported work to an existing member when the Owner column is filled', async () => {
    const { admin, project } = await adminWithProject();
    const developer = await createTestUser({ email: 'dev@example.com', displayName: 'Dev Person' });
    await prisma.projectMember.create({ data: { projectId: project.id, userId: developer.id, projectRole: 'DEVELOPER' } });

    const csv = ['Task,Owner,Status', 'Owned work,Dev Person,Done', 'Email work,dev@example.com,To do'].join('\n');
    const created = await uploadCsv(admin.client, csv);
    const jobId = created.body.data.job.id;
    const input = { projectId: project.id, mapping: { title: 'Task', assignee: 'Owner', status: 'Status' } };

    await authed(app, admin.client).post(`/api/admin/imports/${jobId}/commit`).send(input);

    const tasks = await prisma.task.findMany({ where: { projectId: project.id }, orderBy: { number: 'asc' } });
    expect(tasks.every((task) => task.assigneeId === developer.id)).toBe(true);
  });
});
