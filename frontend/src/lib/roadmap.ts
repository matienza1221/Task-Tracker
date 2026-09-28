/**
 * Implementation status shown on the dashboard so the state of the build is
 * never ambiguous. This is project metadata, not mock application data.
 */
export interface RoadmapPhase {
  phase: number;
  title: string;
  status: 'complete' | 'in_progress' | 'planned';
  summary: string;
}

export const ROADMAP: RoadmapPhase[] = [
  {
    phase: 1,
    title: 'Foundation & authentication',
    status: 'complete',
    summary: 'Docker, PostgreSQL, Prisma, session auth, CSRF, rate limiting, audit log, app shell.',
  },
  {
    phase: 2,
    title: 'Users, roles & projects',
    status: 'complete',
    summary: 'User administration, project CRUD, members, milestones, labels, project permissions.',
  },
  {
    phase: 3,
    title: 'Tasks & subtasks',
    status: 'complete',
    summary: 'Task keys (WEBAPP-1), subtasks, configurable statuses/priorities/types, progress engine.',
  },
  {
    phase: 4,
    title: 'Kanban, filters & search',
    status: 'complete',
    summary: 'Drag-and-drop board, URL-synced filters, saved views, My Tasks, command palette.',
  },
  {
    phase: 5,
    title: 'Collaboration',
    status: 'complete',
    summary: 'Comments, mentions, activity feed, notifications, attachments.',
  },
  {
    phase: 6,
    title: 'Schedule',
    status: 'complete',
    summary: 'Calendar, timeline, milestones, task dependencies with cycle prevention.',
  },
  {
    phase: 7,
    title: 'Insight',
    status: 'complete',
    summary: 'Dashboard widgets, team workload, analytics, burndown, audit log viewer.',
  },
  {
    phase: 8,
    title: 'Import, hardening & production',
    status: 'complete',
    summary: 'Spreadsheet import/export, security review, production Docker, full documentation.',
  },
];
