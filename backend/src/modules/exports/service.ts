import type { User } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { assertProjectPermission } from '../../lib/access';

const HEADERS = [
  'Task key',
  'Title',
  'Labels',
  'Assignee',
  'Priority',
  'Status',
  'Type',
  'Start date',
  'Due date',
  'Completed date',
  'Estimated hours',
  'Actual hours',
  'Progress %',
  'Parent',
  'Milestone',
  'Blocked by',
  'Next step / blocker',
  'Verification note',
  'Code references',
  'Reporter',
  'Created',
  'Updated',
] as const;

/**
 * CSV injection protection: spreadsheet apps execute cells starting with
 * =, +, - or @. Prefixing with an apostrophe keeps the value literal.
 */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

const dateOnly = (value: Date | null): string => (value ? value.toISOString().slice(0, 10) : '');

/**
 * Spreadsheet-shaped export of every task in a project (including subtasks,
 * which carry their parent key so the structure survives the round trip).
 */
export async function exportProjectCsv(user: User, projectId: string): Promise<string> {
  await assertProjectPermission(user, projectId, 'export:run');

  const tasks = await prisma.task.findMany({
    where: { projectId, deletedAt: null },
    include: {
      status: { select: { name: true } },
      priority: { select: { name: true } },
      type: { select: { name: true } },
      assignee: { select: { displayName: true, email: true } },
      reporter: { select: { displayName: true } },
      parent: { select: { key: true } },
      milestone: { select: { name: true } },
      labels: { select: { label: { select: { name: true } } } },
      dependencies: {
        select: { dependsOn: { select: { key: true } } },
      },
    },
    orderBy: [{ number: 'asc' }],
  });

  const lines = [HEADERS.join(',')];
  for (const task of tasks) {
    lines.push(
      [
        task.key,
        task.title,
        task.labels.map((entry) => entry.label.name).join('; '),
        task.assignee ? task.assignee.displayName : '',
        task.priority.name,
        task.status.name,
        task.type.name,
        dateOnly(task.startDate),
        dateOnly(task.dueDate),
        task.completedAt ? task.completedAt.toISOString().slice(0, 10) : '',
        task.estimatedHours === null ? '' : Number(task.estimatedHours),
        Number(task.actualHours),
        task.progress,
        task.parent?.key ?? '',
        task.milestone?.name ?? '',
        task.dependencies.map((entry) => entry.dependsOn.key).join('; '),
        task.nextStep ?? '',
        task.verificationNote ?? '',
        task.codeReferences.join('; '),
        task.reporter?.displayName ?? '',
        task.createdAt.toISOString(),
        task.updatedAt.toISOString(),
      ]
        .map(csvCell)
        .join(','),
    );
  }

  return `${lines.join('\n')}\n`;
}
