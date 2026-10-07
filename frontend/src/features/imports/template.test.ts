import { describe, expect, it } from 'vitest';
import { buildImportTemplateCsv } from './template';
import { suggestMapping } from './types';

const stripBom = (csv: string) => csv.replace(/^\uFEFF/, '');
const lines = () => stripBom(buildImportTemplateCsv()).trim().split('\r\n');

describe('buildImportTemplateCsv', () => {
  it('mirrors the reference sheet: title, KPI block, then the header row', () => {
    const rows = lines();
    expect(rows[0]).toContain('Task tracker');
    expect(rows[1]).toContain('Replace or delete rows marked [Example]');
    expect(rows[3]).toBe('Total tasks,Completed,Blocked,Overdue,Due next 7 days,Completion,,,');
    expect(rows[7]).toBe(
      'Area,Task,Owner,Priority,Status,Due date,Completed date,Blocker / next step,Reference link',
    );
  });

  it('auto-maps its header row back onto the import fields', () => {
    const mapping = suggestMapping(lines()[7].split(','));
    expect(mapping).toMatchObject({
      title: 'Task',
      area: 'Area',
      assignee: 'Owner',
      priority: 'Priority',
      status: 'Status',
      dueDate: 'Due date',
      completedDate: 'Completed date',
      nextStep: 'Blocker / next step',
      codeReferences: 'Reference link',
    });
  });

  it('flags every example row so they are easy to replace or delete', () => {
    const exampleRows = lines().slice(8);
    expect(exampleRows.length).toBeGreaterThan(0);
    expect(exampleRows.every((row) => row.includes('[Example]'))).toBe(true);
  });

  it('starts with a UTF-8 BOM so Excel reads it correctly', () => {
    expect(buildImportTemplateCsv().startsWith('\uFEFF')).toBe(true);
  });
});
