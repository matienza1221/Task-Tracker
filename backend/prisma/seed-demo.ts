/**
 * TeamBoard — demo showcase seed.
 *
 * Creates a believable, fully populated workspace so every screen has content:
 * a team of users, two projects, members, labels, milestones, a backlog of
 * tasks with subtasks, dependencies, comments/mentions, notifications, saved
 * views, activity, audit history and a couple of attachments.
 *
 * Safe to re-run: it owns the demo accounts/projects and resets only their
 * data before recreating it. It never touches the bootstrap admin, real users
 * or unrelated projects.
 *
 *   npm run db:seed:demo
 *   npm run db:seed:demo -- --password 'My-Strong-Passw0rd!'
 *
 * The shared password for every demo account defaults to `Teamboard_Demo_2026!`
 * and can be overridden with SEED_DEMO_PASSWORD or `--password`.
 */
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env';
import { hashPassword, validatePasswordStrength } from '../src/lib/password';
import { seedBaseData } from '../src/lib/seedData';
import { getStorage } from '../src/lib/storage';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Time helpers — everything is relative to "today" so the demo never goes stale
// ---------------------------------------------------------------------------

function dateOnly(offsetDays: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays));
}

function timestamp(offsetDays: number, hour = 9, minute = 30): Date {
  return new Date(dateOnly(offsetDays).getTime() + hour * 3_600_000 + minute * 60_000);
}

// ---------------------------------------------------------------------------
// Vocabulary keys
// ---------------------------------------------------------------------------

type UserKey = 'maya' | 'leo' | 'amara' | 'daniel' | 'sofia';
type StatusKey =
  | 'BACKLOG'
  | 'TODO'
  | 'IN_PROGRESS'
  | 'IN_REVIEW'
  | 'TESTING'
  | 'BLOCKED'
  | 'DONE'
  | 'CANCELLED';
type PriorityKey = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type TypeKey =
  | 'FEATURE'
  | 'BUG'
  | 'IMPROVEMENT'
  | 'RESEARCH'
  | 'DOCUMENTATION'
  | 'MAINTENANCE'
  | 'DEPLOYMENT'
  | 'TESTING';

interface DemoUser {
  key: UserKey;
  email: string;
  displayName: string;
  globalRole: 'PROJECT_MANAGER' | 'DEVELOPER' | 'VIEWER';
}

const DEMO_USERS: readonly DemoUser[] = [
  { key: 'maya', email: 'maya.patel@teamboard.demo', displayName: 'Maya Patel', globalRole: 'PROJECT_MANAGER' },
  { key: 'leo', email: 'leo.fernandez@teamboard.demo', displayName: 'Leo Fernandez', globalRole: 'DEVELOPER' },
  { key: 'amara', email: 'amara.okafor@teamboard.demo', displayName: 'Amara Okafor', globalRole: 'DEVELOPER' },
  { key: 'daniel', email: 'daniel.kim@teamboard.demo', displayName: 'Daniel Kim', globalRole: 'DEVELOPER' },
  { key: 'sofia', email: 'sofia.reyes@teamboard.demo', displayName: 'Sofia Reyes', globalRole: 'VIEWER' },
];

interface DemoSubtask {
  title: string;
  status: StatusKey;
  assignee?: UserKey;
  type?: TypeKey;
  estimate?: number;
  actual?: number;
  progress?: number;
}

interface DemoTask {
  title: string;
  status: StatusKey;
  priority: PriorityKey;
  type: TypeKey;
  assignee?: UserKey;
  reporter?: UserKey;
  milestone?: string;
  labels?: string[];
  start?: number;
  due?: number;
  completed?: number;
  estimate?: number;
  actual?: number;
  progress?: number;
  nextStep?: string;
  verification?: string;
  codeRefs?: string[];
  description?: string;
  subtasks?: DemoSubtask[];
}

interface DemoMilestone {
  name: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  target: number;
  completed?: number;
}

interface DemoLabel {
  name: string;
  color: string;
}

interface DemoComment {
  task: string;
  author: UserKey;
  body: string;
  mentions?: UserKey[];
  daysAgo: number;
}

interface DemoSavedView {
  user: UserKey;
  name: string;
  filters: Record<string, unknown>;
  isDefault?: boolean;
}

interface DemoNotification {
  user: UserKey;
  task: string;
  type: 'TASK_ASSIGNED' | 'TASK_STATUS_CHANGED' | 'TASK_COMMENTED' | 'TASK_MENTIONED' | 'TASK_DUE_SOON' | 'TASK_OVERDUE';
  title: string;
  body: string;
  read?: boolean;
  daysAgo: number;
}

// ---------------------------------------------------------------------------
// Main project — "Web App Platform"
// ---------------------------------------------------------------------------

const MAIN_LABELS: DemoLabel[] = [
  { name: 'Backend', color: '#55abdb' },
  { name: 'Frontend', color: '#8280e9' },
  { name: 'Database', color: '#6fc2b0' },
  { name: 'Security', color: '#e57373' },
  { name: 'Performance', color: '#e3b23c' },
  { name: 'DevOps', color: '#a976e0' },
  { name: 'Documentation', color: '#9d9db8' },
  { name: 'Tech Debt', color: '#b98c22' },
];

const MAIN_MILESTONES: DemoMilestone[] = [
  { name: 'Foundation & CI', status: 'COMPLETED', target: -50, completed: -50 },
  { name: 'Authentication & security', status: 'COMPLETED', target: -38, completed: -38 },
  { name: 'Projects & task management', status: 'IN_PROGRESS', target: 3 },
  { name: 'Collaboration suite', status: 'PLANNED', target: 18 },
  { name: 'Insights & reporting', status: 'PLANNED', target: 32 },
  { name: 'v1.0 launch readiness', status: 'PLANNED', target: 45 },
];

const MAIN_TASKS: DemoTask[] = [
  {
    title: 'Set up monorepo, linting and CI',
    status: 'DONE',
    priority: 'HIGH',
    type: 'DEPLOYMENT',
    assignee: 'leo',
    milestone: 'Foundation & CI',
    labels: ['DevOps'],
    start: -58,
    due: -54,
    completed: -54,
    estimate: 8,
    actual: 10,
    codeRefs: ['ci.yml:1-79', 'package.json:1-40'],
    verification: 'CI green on main; typecheck and both test suites run on every push.',
  },
  {
    title: 'Provision PostgreSQL with Prisma migrations',
    status: 'DONE',
    priority: 'CRITICAL',
    type: 'DEPLOYMENT',
    assignee: 'amara',
    milestone: 'Foundation & CI',
    labels: ['DevOps', 'Database'],
    start: -58,
    due: -52,
    completed: -52,
    estimate: 10,
    actual: 12,
    codeRefs: ['prisma/schema.prisma:1-120'],
    verification: 'Migrations apply cleanly from an empty database.',
  },
  {
    title: 'OpenSSL development certificates and HTTPS',
    status: 'DONE',
    priority: 'MEDIUM',
    type: 'DEPLOYMENT',
    assignee: 'leo',
    milestone: 'Foundation & CI',
    labels: ['DevOps', 'Security'],
    start: -55,
    due: -50,
    completed: -50,
    estimate: 4,
    actual: 3,
  },
  {
    title: 'Email/password sign-in and sign-out',
    status: 'DONE',
    priority: 'CRITICAL',
    type: 'FEATURE',
    assignee: 'amara',
    milestone: 'Authentication & security',
    labels: ['Security', 'Backend'],
    start: -52,
    due: -44,
    completed: -45,
    estimate: 16,
    actual: 18,
    codeRefs: ['backend/src/modules/auth/service.ts:1-220'],
    verification: 'Uniform responses for unknown accounts; login covered by integration tests.',
  },
  {
    title: 'Session management with sliding expiry',
    status: 'DONE',
    priority: 'HIGH',
    type: 'FEATURE',
    assignee: 'leo',
    milestone: 'Authentication & security',
    labels: ['Security', 'Backend'],
    start: -50,
    due: -43,
    completed: -42,
    estimate: 12,
    actual: 14,
  },
  {
    title: 'CSRF double-submit and origin allowlist',
    status: 'DONE',
    priority: 'HIGH',
    type: 'FEATURE',
    assignee: 'amara',
    milestone: 'Authentication & security',
    labels: ['Security'],
    start: -48,
    due: -40,
    completed: -39,
    estimate: 8,
    actual: 7,
  },
  {
    title: 'Rate limiting and account lockout',
    status: 'DONE',
    priority: 'HIGH',
    type: 'FEATURE',
    assignee: 'leo',
    milestone: 'Authentication & security',
    labels: ['Security', 'Backend'],
    start: -46,
    due: -38,
    completed: -37,
    estimate: 8,
    actual: 9,
  },
  {
    title: 'Password reset and forced rotation',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    type: 'FEATURE',
    assignee: 'amara',
    milestone: 'Authentication & security',
    labels: ['Security'],
    start: -30,
    due: 4,
    estimate: 12,
    actual: 6,
    nextStep: 'Finish the mail outbox delivery job and expiry sweep.',
    subtasks: [
      { title: 'Reset request endpoint and token hashing', status: 'DONE', assignee: 'amara', estimate: 4, actual: 4 },
      { title: 'Single-use tokens with expiry', status: 'DONE', assignee: 'amara', estimate: 3, actual: 3 },
      { title: 'First sign-in password rotation', status: 'IN_REVIEW', assignee: 'amara', estimate: 4, actual: 2 },
    ],
  },
  {
    title: 'Project CRUD, codes and archiving',
    status: 'DONE',
    priority: 'HIGH',
    type: 'FEATURE',
    assignee: 'maya',
    milestone: 'Projects & task management',
    labels: ['Backend'],
    start: -44,
    due: -34,
    completed: -33,
    estimate: 16,
    actual: 18,
  },
  {
    title: 'Project membership roles over global roles',
    status: 'DONE',
    priority: 'HIGH',
    type: 'FEATURE',
    assignee: 'leo',
    milestone: 'Projects & task management',
    labels: ['Backend', 'Security'],
    start: -42,
    due: -32,
    completed: -31,
    estimate: 12,
    actual: 11,
  },
  {
    title: 'Task model with per-project keys',
    status: 'DONE',
    priority: 'CRITICAL',
    type: 'FEATURE',
    assignee: 'leo',
    milestone: 'Projects & task management',
    labels: ['Backend', 'Database'],
    start: -40,
    due: -28,
    completed: -27,
    estimate: 20,
    actual: 24,
    codeRefs: ['backend/src/modules/tasks/taskService.ts:315-394'],
  },
  {
    title: 'Subtask rollup and progress engine',
    status: 'DONE',
    priority: 'HIGH',
    type: 'FEATURE',
    assignee: 'amara',
    milestone: 'Projects & task management',
    labels: ['Backend'],
    start: -32,
    due: -22,
    completed: -21,
    estimate: 12,
    actual: 10,
  },
  {
    title: 'Optimistic concurrency for task edits',
    status: 'DONE',
    priority: 'MEDIUM',
    type: 'IMPROVEMENT',
    assignee: 'daniel',
    milestone: 'Projects & task management',
    labels: ['Backend'],
    start: -28,
    due: -16,
    completed: -15,
    estimate: 8,
    actual: 9,
  },
  {
    title: 'Configurable statuses, priorities and types',
    status: 'DONE',
    priority: 'MEDIUM',
    type: 'FEATURE',
    assignee: 'maya',
    milestone: 'Projects & task management',
    labels: ['Backend', 'Frontend'],
    start: -30,
    due: -18,
    completed: -17,
    estimate: 14,
    actual: 13,
  },
  {
    title: 'Kanban board with pointer and keyboard drag',
    status: 'IN_REVIEW',
    priority: 'HIGH',
    type: 'FEATURE',
    assignee: 'amara',
    milestone: 'Projects & task management',
    labels: ['Frontend'],
    start: -18,
    due: -2,
    estimate: 20,
    actual: 18,
    progress: 85,
    nextStep: 'Address review notes on the screen-reader announcements.',
    description: 'Drag & drop with a keyboard fallback and optimistic movement that rolls back on conflicts.',
  },
  {
    title: 'URL-synced task filters and saved views',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    type: 'FEATURE',
    assignee: 'leo',
    milestone: 'Projects & task management',
    labels: ['Frontend'],
    start: -12,
    due: 3,
    estimate: 16,
    actual: 9,
    progress: 60,
    nextStep: 'Persist the default saved view per project.',
  },
  {
    title: 'Command palette (Ctrl/Cmd+K)',
    status: 'TODO',
    priority: 'LOW',
    type: 'FEATURE',
    assignee: 'daniel',
    milestone: 'Collaboration suite',
    labels: ['Frontend'],
    due: 10,
    estimate: 8,
  },
  {
    title: 'Comments with @mentions',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    type: 'FEATURE',
    assignee: 'daniel',
    milestone: 'Collaboration suite',
    labels: ['Frontend', 'Backend'],
    start: -10,
    due: 6,
    estimate: 14,
    actual: 7,
    progress: 45,
    nextStep: 'Add keyboard navigation to the mention autocomplete.',
  },
  {
    title: 'Notification inbox and due reminders',
    status: 'TODO',
    priority: 'MEDIUM',
    type: 'FEATURE',
    assignee: 'amara',
    milestone: 'Collaboration suite',
    labels: ['Backend'],
    due: 12,
    estimate: 12,
  },
  {
    title: 'File attachments with safe download',
    status: 'BACKLOG',
    priority: 'MEDIUM',
    type: 'FEATURE',
    milestone: 'Collaboration suite',
    labels: ['Backend', 'Security'],
    due: 20,
    estimate: 16,
  },
  {
    title: 'Dashboard aggregate endpoint',
    status: 'TODO',
    priority: 'HIGH',
    type: 'FEATURE',
    assignee: 'maya',
    milestone: 'Insights & reporting',
    labels: ['Backend'],
    due: 22,
    estimate: 18,
  },
  {
    title: 'Team workload view',
    status: 'BACKLOG',
    priority: 'MEDIUM',
    type: 'FEATURE',
    milestone: 'Insights & reporting',
    labels: ['Frontend'],
    due: 28,
    estimate: 10,
  },
  {
    title: 'Fix Safari date picker regression',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    type: 'BUG',
    assignee: 'amara',
    milestone: 'Projects & task management',
    labels: ['Frontend'],
    start: -6,
    due: -2,
    estimate: 6,
    actual: 5,
    progress: 70,
    nextStep: 'Retest on Safari 17 and iOS 17.',
    description: 'The picker opens behind the modal layer on Safari.',
  },
  {
    title: 'Roll back optimistic board moves on conflict',
    status: 'DONE',
    priority: 'MEDIUM',
    type: 'BUG',
    assignee: 'daniel',
    milestone: 'Projects & task management',
    labels: ['Frontend'],
    start: -14,
    due: -6,
    completed: -6,
    estimate: 6,
    actual: 4,
  },
  {
    title: 'Spreadsheet import wizard',
    status: 'DONE',
    priority: 'HIGH',
    type: 'FEATURE',
    assignee: 'maya',
    milestone: 'Insights & reporting',
    labels: ['Backend', 'Frontend'],
    start: -20,
    due: -8,
    completed: -7,
    nextStep: 'Import the legacy sheet during the team migration window.',
    subtasks: [
      { title: 'CSV/XLSX parsing and header detection', status: 'DONE', assignee: 'maya', estimate: 6, actual: 7 },
      { title: 'Column auto-mapping', status: 'DONE', assignee: 'maya', estimate: 5, actual: 5 },
      { title: 'Preview, validation and duplicate skipping', status: 'DONE', assignee: 'leo', estimate: 7, actual: 8 },
      { title: 'Idempotent commit', status: 'DONE', assignee: 'maya', estimate: 6, actual: 6 },
    ],
  },
  {
    title: 'CSV export with formula-injection protection',
    status: 'DONE',
    priority: 'MEDIUM',
    type: 'FEATURE',
    assignee: 'leo',
    milestone: 'Insights & reporting',
    labels: ['Backend', 'Security'],
    start: -16,
    due: -9,
    completed: -9,
    estimate: 8,
    actual: 7,
  },
  {
    title: 'Audit log viewer with CSV export',
    status: 'TODO',
    priority: 'MEDIUM',
    type: 'FEATURE',
    assignee: 'maya',
    milestone: 'Insights & reporting',
    labels: ['Backend'],
    due: 26,
    estimate: 10,
  },
  {
    title: 'Documentation: README, API and security',
    status: 'IN_PROGRESS',
    priority: 'LOW',
    type: 'DOCUMENTATION',
    assignee: 'daniel',
    milestone: 'v1.0 launch readiness',
    labels: ['Documentation'],
    start: -12,
    due: 8,
    estimate: 12,
    actual: 6,
    progress: 50,
  },
  {
    title: 'Prepare v1.0 release notes',
    status: 'TODO',
    priority: 'MEDIUM',
    type: 'DOCUMENTATION',
    assignee: 'maya',
    milestone: 'v1.0 launch readiness',
    labels: ['Documentation'],
    due: 1,
    estimate: 4,
  },
  {
    title: 'Refresh onboarding screenshots',
    status: 'TODO',
    priority: 'LOW',
    type: 'DOCUMENTATION',
    assignee: 'leo',
    milestone: 'v1.0 launch readiness',
    labels: ['Documentation'],
    due: 0,
    estimate: 3,
  },
  {
    title: 'Legacy Google Sheets sync',
    status: 'CANCELLED',
    priority: 'LOW',
    type: 'MAINTENANCE',
    assignee: 'leo',
    labels: ['Tech Debt'],
    start: -25,
    due: -12,
    actual: 4,
    verification: 'Superseded by the CSV import wizard.',
  },
];

const MAIN_DEPENDENCIES: [string, string][] = [
  ['URL-synced task filters and saved views', 'Task model with per-project keys'],
  ['Notification inbox and due reminders', 'Comments with @mentions'],
  ['Dashboard aggregate endpoint', 'Subtask rollup and progress engine'],
  ['Fix Safari date picker regression', 'Kanban board with pointer and keyboard drag'],
  ['File attachments with safe download', 'Task model with per-project keys'],
  ['Command palette (Ctrl/Cmd+K)', 'URL-synced task filters and saved views'],
];

const MAIN_COMMENTS: DemoComment[] = [
  {
    task: 'Kanban board with pointer and keyboard drag',
    author: 'amara',
    body: 'Keyboard drag is in. @Leo Fernandez can you review the focus-ring semantics before I merge?',
    mentions: ['leo'],
    daysAgo: 1,
  },
  {
    task: 'Kanban board with pointer and keyboard drag',
    author: 'leo',
    body: 'Reviewed — one nit on the live-region announcement text. Pushing a small follow-up now.',
    daysAgo: 0,
  },
  {
    task: 'Password reset and forced rotation',
    author: 'maya',
    body: '@Amara Okafor remember the outbox path must never write the raw token into logs.',
    mentions: ['amara'],
    daysAgo: 2,
  },
  {
    task: 'Fix Safari date picker regression',
    author: 'daniel',
    body: 'Reproduced on Safari 17.2 — the picker renders behind the modal layer.',
    daysAgo: 1,
  },
  {
    task: 'Spreadsheet import wizard',
    author: 'maya',
    body: 'The 74% completion figure from the old sheet matches the imported project progress. Great work.',
    daysAgo: 3,
  },
];

const MAIN_SAVED_VIEWS: DemoSavedView[] = [
  {
    user: 'maya',
    name: 'Delivery focus',
    filters: { status: ['IN_PROGRESS', 'IN_REVIEW'], includeCompleted: false, sort: 'dueDate' },
    isDefault: true,
  },
  { user: 'maya', name: 'Blocked & overdue', filters: { blocked: true, sort: '-updatedAt' } },
  { user: 'leo', name: 'My work', filters: { scope: 'mine', includeCompleted: false, sort: 'dueDate' }, isDefault: true },
  { user: 'amara', name: 'In review', filters: { status: ['IN_REVIEW'], sort: '-updatedAt' } },
  {
    user: 'daniel',
    name: 'High priority',
    filters: { priority: ['CRITICAL', 'HIGH'], includeCompleted: false, sort: '-priority' },
  },
];

const MAIN_NOTIFICATIONS: DemoNotification[] = [
  {
    user: 'maya',
    task: 'Kanban board with pointer and keyboard drag',
    type: 'TASK_COMMENTED',
    title: 'New comment on {{key}}',
    body: 'Amara Okafor: Keyboard drag is in. Can you review the focus-ring semantics?',
    daysAgo: 1,
  },
  {
    user: 'leo',
    task: 'Kanban board with pointer and keyboard drag',
    type: 'TASK_MENTIONED',
    title: 'Amara Okafor mentioned you on {{key}}',
    body: 'Keyboard drag is in. @Leo Fernandez can you review the focus-ring semantics?',
    daysAgo: 1,
  },
  {
    user: 'amara',
    task: 'Kanban board with pointer and keyboard drag',
    type: 'TASK_COMMENTED',
    title: 'New comment on {{key}}',
    body: 'Leo Fernandez: one nit on the live-region announcement text.',
    read: true,
    daysAgo: 0,
  },
  {
    user: 'amara',
    task: 'Password reset and forced rotation',
    type: 'TASK_MENTIONED',
    title: 'Maya Patel mentioned you on {{key}}',
    body: 'Remember the outbox path must never write the raw token into logs.',
    daysAgo: 2,
  },
  {
    user: 'amara',
    task: 'Fix Safari date picker regression',
    type: 'TASK_OVERDUE',
    title: '{{key}} is overdue',
    body: '“Fix Safari date picker regression” is past its due date.',
    daysAgo: 0,
  },
  {
    user: 'amara',
    task: 'Fix Safari date picker regression',
    type: 'TASK_COMMENTED',
    title: 'New comment on {{key}}',
    body: 'Daniel Kim: Reproduced on Safari 17.2 — the picker renders behind the modal layer.',
    read: true,
    daysAgo: 1,
  },
  {
    user: 'maya',
    task: 'Prepare v1.0 release notes',
    type: 'TASK_DUE_SOON',
    title: '{{key}} is due soon',
    body: '“Prepare v1.0 release notes” is due tomorrow.',
    daysAgo: 0,
  },
  {
    user: 'leo',
    task: 'Refresh onboarding screenshots',
    type: 'TASK_DUE_SOON',
    title: '{{key}} is due today',
    body: '“Refresh onboarding screenshots” is due today.',
    daysAgo: 0,
  },
  {
    user: 'daniel',
    task: 'Comments with @mentions',
    type: 'TASK_ASSIGNED',
    title: 'You were assigned {{key}}',
    body: 'Maya Patel assigned “Comments with @mentions” to you.',
    daysAgo: 4,
  },
  {
    user: 'amara',
    task: 'Kanban board with pointer and keyboard drag',
    type: 'TASK_ASSIGNED',
    title: 'You were assigned {{key}}',
    body: 'Maya Patel assigned “Kanban board with pointer and keyboard drag” to you.',
    read: true,
    daysAgo: 12,
  },
  {
    user: 'leo',
    task: 'URL-synced task filters and saved views',
    type: 'TASK_ASSIGNED',
    title: 'You were assigned {{key}}',
    body: 'Maya Patel assigned “URL-synced task filters and saved views” to you.',
    read: true,
    daysAgo: 9,
  },
];

// ---------------------------------------------------------------------------
// Second project — "Mobile Companion App" (shows cross-project dashboards)
// ---------------------------------------------------------------------------

const MOBILE_LABELS: DemoLabel[] = [
  { name: 'Mobile', color: '#4a9dc9' },
  { name: 'iOS', color: '#9d9db8' },
  { name: 'Android', color: '#66c294' },
];

const MOBILE_MILESTONES: DemoMilestone[] = [
  { name: 'Design system alignment', status: 'PLANNED', target: 30 },
  { name: 'Beta build', status: 'PLANNED', target: 70 },
];

const MOBILE_TASKS: DemoTask[] = [
  {
    title: 'Define mobile navigation architecture',
    status: 'TODO',
    priority: 'HIGH',
    type: 'RESEARCH',
    assignee: 'amara',
    milestone: 'Design system alignment',
    labels: ['Mobile'],
    start: 5,
    due: 12,
    estimate: 10,
    nextStep: 'Prototype the tab vs drawer decision with the design team.',
  },
  {
    title: 'Set up React Native project and CI',
    status: 'BACKLOG',
    priority: 'HIGH',
    type: 'FEATURE',
    assignee: 'daniel',
    milestone: 'Design system alignment',
    labels: ['Mobile'],
    due: 15,
    estimate: 12,
  },
  {
    title: 'Offline task cache',
    status: 'BACKLOG',
    priority: 'MEDIUM',
    type: 'FEATURE',
    milestone: 'Beta build',
    labels: ['Mobile'],
    due: 30,
    estimate: 16,
  },
  {
    title: 'Push notification delivery',
    status: 'BACKLOG',
    priority: 'MEDIUM',
    type: 'FEATURE',
    assignee: 'amara',
    milestone: 'Beta build',
    labels: ['Mobile', 'Backend'],
    due: 45,
    estimate: 14,
  },
  {
    title: 'Biometric sign-in',
    status: 'BACKLOG',
    priority: 'LOW',
    type: 'RESEARCH',
    assignee: 'daniel',
    milestone: 'Beta build',
    labels: ['Mobile', 'Security'],
    due: 50,
    estimate: 10,
  },
  {
    title: 'App store readiness checklist',
    status: 'TODO',
    priority: 'LOW',
    type: 'DOCUMENTATION',
    assignee: 'maya',
    milestone: 'Beta build',
    labels: ['Documentation', 'Mobile'],
    due: 70,
    estimate: 6,
  },
];

const MOBILE_DEPENDENCIES: [string, string][] = [
  ['Biometric sign-in', 'Set up React Native project and CI'],
  ['Push notification delivery', 'Offline task cache'],
];

const MOBILE_COMMENTS: DemoComment[] = [
  {
    task: 'Define mobile navigation architecture',
    author: 'amara',
    body: 'Leaning toward a bottom tab bar with a persistent quick-add button. @Maya Patel any objections?',
    mentions: ['maya'],
    daysAgo: 1,
  },
];

const MOBILE_SAVED_VIEWS: DemoSavedView[] = [
  { user: 'maya', name: 'Discovery backlog', filters: { status: ['BACKLOG', 'TODO'], sort: 'dueDate' }, isDefault: true },
];

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function findActiveUserByEmail(email: string) {
  return prisma.user.findFirst({ where: { email, deletedAt: null } });
}

function categoryOf(statusKey: StatusKey, categories: Map<string, string>): string {
  return categories.get(statusKey) ?? 'TODO';
}

function subtaskProgress(subtasks: DemoSubtask[], categories: Map<string, string>): number {
  const active = subtasks.filter((subtask) => categoryOf(subtask.status, categories) !== 'CANCELLED');
  if (active.length === 0) return 0;
  const done = active.filter((subtask) => categoryOf(subtask.status, categories) === 'DONE').length;
  return Math.round((done / active.length) * 100);
}

function computeProjectProgress(tasks: { progress: number; estimatedHours: number | null }[], weighting: 'COUNT' | 'HOURS'): number {
  if (tasks.length === 0) return 0;
  if (weighting === 'HOURS') {
    const rows = tasks.map((task) => ({
      weight: task.estimatedHours && task.estimatedHours > 0 ? task.estimatedHours : 1,
      progress: task.progress,
    }));
    const total = rows.reduce((sum, row) => sum + row.weight, 0);
    return Math.round((rows.reduce((sum, row) => sum + row.weight * row.progress, 0) / total) * 100) / 100;
  }
  return Math.round((tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

interface CreatedTask {
  id: string;
  key: string;
  number: number;
  title: string;
  statusKey: StatusKey;
  category: string;
  projectId: string;
  assigneeId: string | null;
  reporterId: string | null;
  dueDate: Date | null;
  progress: number;
  estimatedHours: number | null;
  isSubtask: boolean;
}

interface SeedContext {
  code: string;
  projectId: string;
  weighting: 'COUNT' | 'HOURS';
  userIds: Record<UserKey, string>;
  statusIds: Map<StatusKey, string>;
  statusCategories: Map<string, string>;
  priorityIds: Map<PriorityKey, string>;
  typeIds: Map<TypeKey, string>;
  milestoneIds: Map<string, string>;
  labelIds: Map<string, string>;
  defaultReporter: UserKey;
}

async function createTasks(
  ctx: SeedContext,
  defs: DemoTask[],
  activity: Prisma.ActivityLogCreateManyInput[],
  audit: Prisma.AuditLogCreateManyInput[],
): Promise<Map<string, CreatedTask>> {
  const created = new Map<string, CreatedTask>();
  const sortOrderByStatus = new Map<string, number>();
  let number = 0;

  const pushTaskEvents = (task: CreatedTask, def: DemoTask, isSubtask: boolean) => {
    const reporter = ctx.userIds[def.reporter ?? ctx.defaultReporter];
    const reporterName = DEMO_USERS.find((user) => user.key === (def.reporter ?? ctx.defaultReporter))?.displayName ?? 'System';
    const createdAt = timestamp((def.start ?? def.due ?? -20) - 1, 10, 15);
    activity.push({
      projectId: ctx.projectId,
      taskId: task.id,
      actorUserId: reporter,
      actorNameSnapshot: reporterName,
      action: 'TASK_CREATED',
      newValue: task.key,
      metadata: toJson({ key: task.key, title: task.title, parent: isSubtask }),
      createdAt,
    });
    audit.push({
      actorUserId: reporter,
      actorEmail: DEMO_USERS.find((user) => user.key === (def.reporter ?? ctx.defaultReporter))?.email ?? null,
      action: 'TASK_CREATED',
      resourceType: 'task',
      resourceId: task.id,
      metadata: toJson({ demo: true, projectId: ctx.projectId, key: task.key }),
      createdAt,
    });

    if (def.assignee && task.assigneeId) {
      const assigneeName = DEMO_USERS.find((user) => user.key === def.assignee)?.displayName ?? 'a teammate';
      activity.push({
        projectId: ctx.projectId,
        taskId: task.id,
        actorUserId: reporter,
        actorNameSnapshot: reporterName,
        action: 'TASK_ASSIGNED',
        field: 'assignee',
        newValue: assigneeName,
        metadata: toJson({ key: task.key }),
        createdAt: timestamp((def.start ?? def.due ?? -18) - 1, 11, 0),
      });
    }

    if (!isSubtask && def.status !== 'BACKLOG' && def.status !== 'TODO') {
      activity.push({
        projectId: ctx.projectId,
        taskId: task.id,
        actorUserId: task.assigneeId ?? reporter,
        actorNameSnapshot:
          DEMO_USERS.find((user) => user.key === def.assignee)?.displayName ?? reporterName,
        action: 'TASK_STATUS_CHANGED',
        field: 'status',
        oldValue: 'Backlog',
        newValue: def.status.replace('_', ' '),
        metadata: toJson({ key: task.key }),
        createdAt: timestamp((def.start ?? -14) + 1, 14, 45),
      });
    }
  };

  for (const def of defs) {
    number += 1;
    const statusId = ctx.statusIds.get(def.status)!;
    const hasSubtasks = Boolean(def.subtasks && def.subtasks.length > 0);
    const computedProgress = hasSubtasks
      ? subtaskProgress(def.subtasks!, ctx.statusCategories)
      : categoryOf(def.status, ctx.statusCategories) === 'DONE'
        ? 100
        : (def.progress ?? 0);
    const sortOrder = (sortOrderByStatus.get(def.status) ?? 0) + 1;
    sortOrderByStatus.set(def.status, sortOrder);

    const task = await prisma.task.create({
      data: {
        projectId: ctx.projectId,
        number,
        key: `${ctx.code}-${number}`,
        title: def.title,
        description: def.description ?? null,
        statusId,
        priorityId: ctx.priorityIds.get(def.priority)!,
        typeId: ctx.typeIds.get(def.type)!,
        assigneeId: def.assignee ? ctx.userIds[def.assignee] : null,
        reporterId: ctx.userIds[def.reporter ?? ctx.defaultReporter],
        milestoneId: def.milestone ? ctx.milestoneIds.get(def.milestone) ?? null : null,
        startDate: def.start !== undefined ? dateOnly(def.start) : null,
        dueDate: def.due !== undefined ? dateOnly(def.due) : null,
        completedAt: def.completed !== undefined ? timestamp(def.completed, 16, 0) : null,
        estimatedHours: def.estimate ?? null,
        actualHours: def.actual ?? 0,
        progress: computedProgress,
        progressMode: hasSubtasks ? 'AUTO' : 'MANUAL',
        nextStep: def.nextStep ?? null,
        verificationNote: def.verification ?? null,
        codeReferences: def.codeRefs ?? [],
        sortOrder,
        createdAt: timestamp((def.start ?? def.due ?? -25) - 2, 9, 0),
      },
    });

    if (def.labels && def.labels.length > 0) {
      const labelIds = def.labels.map((name) => ctx.labelIds.get(name)).filter((id): id is string => Boolean(id));
      if (labelIds.length > 0) {
        await prisma.taskLabel.createMany({ data: labelIds.map((labelId) => ({ taskId: task.id, labelId })), skipDuplicates: true });
      }
    }

    const createdTask: CreatedTask = {
      id: task.id,
      key: task.key,
      number,
      title: task.title,
      statusKey: def.status,
      category: categoryOf(def.status, ctx.statusCategories),
      projectId: ctx.projectId,
      assigneeId: task.assigneeId,
      reporterId: task.reporterId,
      dueDate: task.dueDate,
      progress: computedProgress,
      estimatedHours: def.estimate ?? null,
      isSubtask: false,
    };
    created.set(def.title, createdTask);
    pushTaskEvents(createdTask, def, false);

    if (def.subtasks) {
      for (const subtask of def.subtasks) {
        number += 1;
        const subtaskStatus = subtask.status;
        const subtaskProgressValue =
          categoryOf(subtaskStatus, ctx.statusCategories) === 'DONE' ? 100 : (subtask.progress ?? 0);
        const subtaskTask = await prisma.task.create({
          data: {
            projectId: ctx.projectId,
            parentTaskId: task.id,
            number,
            key: `${ctx.code}-${number}`,
            title: subtask.title,
            statusId: ctx.statusIds.get(subtaskStatus)!,
            priorityId: ctx.priorityIds.get(def.priority)!,
            typeId: ctx.typeIds.get(subtask.type ?? def.type)!,
            assigneeId: subtask.assignee ? ctx.userIds[subtask.assignee] : null,
            reporterId: ctx.userIds[def.reporter ?? ctx.defaultReporter],
            milestoneId: def.milestone ? ctx.milestoneIds.get(def.milestone) ?? null : null,
            estimatedHours: subtask.estimate ?? null,
            actualHours: subtask.actual ?? 0,
            progress: subtaskProgressValue,
            progressMode: 'MANUAL',
            sortOrder: 0,
            createdAt: timestamp((def.start ?? -25) - 1, 9, 30),
          },
        });
        const createdSubtask: CreatedTask = {
          id: subtaskTask.id,
          key: subtaskTask.key,
          number,
          title: subtask.title,
          statusKey: subtaskStatus,
          category: categoryOf(subtaskStatus, ctx.statusCategories),
          projectId: ctx.projectId,
          assigneeId: subtaskTask.assigneeId,
          reporterId: subtaskTask.reporterId,
          dueDate: null,
          progress: subtaskProgressValue,
          estimatedHours: subtask.estimate ?? null,
          isSubtask: true,
        };
        created.set(`${def.title} › ${subtask.title}`, createdSubtask);
        pushTaskEvents(
          createdSubtask,
          {
            title: subtask.title,
            status: subtaskStatus,
            priority: def.priority,
            type: subtask.type ?? def.type,
            assignee: subtask.assignee,
            reporter: def.reporter,
            start: def.start,
            due: def.due,
          },
          true,
        );
      }
    }
  }

  await prisma.project.update({ where: { id: ctx.projectId }, data: { taskSequence: number } });

  const topLevel = [...created.values()].filter((task) => !task.isSubtask);
  const progress = computeProjectProgress(
    topLevel
      .filter((task) => task.category !== 'CANCELLED')
      .map((task) => ({ progress: task.progress, estimatedHours: task.estimatedHours })),
    ctx.weighting,
  );
  await prisma.project.update({ where: { id: ctx.projectId }, data: { progress } });

  return created;
}

async function seedComments(
  ctx: SeedContext,
  tasks: Map<string, CreatedTask>,
  defs: DemoComment[],
  activity: Prisma.ActivityLogCreateManyInput[],
  audit: Prisma.AuditLogCreateManyInput[],
): Promise<number> {
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  for (const def of defs) {
    const task = tasks.get(def.task);
    if (!task) continue;
    const authorId = ctx.userIds[def.author];
    const author = DEMO_USERS.find((user) => user.key === def.author)!;
    const createdAt = timestamp(-def.daysAgo, 13, 10);

    const comment = await prisma.comment.create({
      data: { taskId: task.id, authorId, body: def.body, createdAt },
    });

    const mentionIds = (def.mentions ?? []).map((key) => ctx.userIds[key]).filter((id) => id && id !== authorId);
    if (mentionIds.length > 0) {
      await prisma.commentMention.createMany({
        data: mentionIds.map((userId) => ({ commentId: comment.id, userId })),
        skipDuplicates: true,
      });
    }

    activity.push({
      projectId: ctx.projectId,
      taskId: task.id,
      actorUserId: authorId,
      actorNameSnapshot: author.displayName,
      action: 'COMMENT_CREATED',
      metadata: toJson({ key: task.key, commentId: comment.id, mentions: mentionIds.length }),
      createdAt,
    });
    audit.push({
      actorUserId: authorId,
      actorEmail: author.email,
      action: 'COMMENT_CREATED',
      resourceType: 'comment',
      resourceId: comment.id,
      metadata: toJson({ demo: true, projectId: ctx.projectId, taskId: task.id }),
      createdAt,
    });

    for (const userId of mentionIds) {
      notifications.push({
        userId,
        type: 'TASK_MENTIONED',
        title: `${author.displayName} mentioned you on ${task.key}`,
        body: def.body.slice(0, 200),
        entityType: 'task',
        entityId: task.id,
        projectId: ctx.projectId,
        taskId: task.id,
        commentId: comment.id,
        isRead: false,
        createdAt,
      });
    }

    const commentRecipients = new Set<string>();
    if (task.assigneeId && task.assigneeId !== authorId) commentRecipients.add(task.assigneeId);
    if (task.reporterId && task.reporterId !== authorId) commentRecipients.add(task.reporterId);
    for (const userId of commentRecipients) {
      notifications.push({
        userId,
        type: 'TASK_COMMENTED',
        title: `New comment on ${task.key}`,
        body: `${author.displayName}: ${def.body.slice(0, 200)}`,
        entityType: 'task',
        entityId: task.id,
        projectId: ctx.projectId,
        taskId: task.id,
        commentId: comment.id,
        isRead: false,
        createdAt,
      });
    }
  }

  if (notifications.length > 0) {
    await prisma.notification.createMany({ data: notifications });
  }
  return notifications.length;
}

async function seedDependencies(
  ctx: SeedContext,
  tasks: Map<string, CreatedTask>,
  pairs: [string, string][],
  activity: Prisma.ActivityLogCreateManyInput[],
): Promise<void> {
  for (const [blockedTitle, blockerTitle] of pairs) {
    const blocked = tasks.get(blockedTitle);
    const blocker = tasks.get(blockerTitle);
    if (!blocked || !blocker) continue;
    await prisma.taskDependency.create({
      data: {
        taskId: blocked.id,
        dependsOnTaskId: blocker.id,
        createdById: ctx.userIds[ctx.defaultReporter],
      },
    });
    activity.push({
      projectId: ctx.projectId,
      taskId: blocked.id,
      actorUserId: ctx.userIds[ctx.defaultReporter],
      actorNameSnapshot: DEMO_USERS.find((user) => user.key === ctx.defaultReporter)!.displayName,
      action: 'DEPENDENCY_ADDED',
      newValue: blocker.key,
      metadata: toJson({ key: blocked.key, dependsOn: blocker.key }),
      createdAt: timestamp(-2, 15, 20),
    });
  }
}

async function seedSavedViews(ctx: SeedContext, defs: DemoSavedView[]): Promise<number> {
  let count = 0;
  for (const def of defs) {
    await prisma.savedView.create({
      data: {
        userId: ctx.userIds[def.user],
        projectId: ctx.projectId,
        scope: 'PROJECT',
        name: def.name,
        filters: toJson(def.filters),
        isDefault: def.isDefault ?? false,
      },
    });
    count += 1;
  }
  return count;
}

async function seedNotifications(
  ctx: SeedContext,
  tasks: Map<string, CreatedTask>,
  defs: DemoNotification[],
): Promise<number> {
  const rows: Prisma.NotificationCreateManyInput[] = [];
  for (const def of defs) {
    const task = tasks.get(def.task);
    if (!task) continue;
    rows.push({
      userId: ctx.userIds[def.user],
      type: def.type,
      title: def.title.replace('{{key}}', task.key),
      body: def.body,
      entityType: 'task',
      entityId: task.id,
      projectId: ctx.projectId,
      taskId: task.id,
      isRead: def.read ?? false,
      readAt: def.read ? timestamp(-def.daysAgo, 15, 0) : null,
      createdAt: timestamp(-def.daysAgo, 12, 0),
    });
  }
  await prisma.notification.createMany({ data: rows });
  return rows.length;
}

async function seedAttachments(
  ctx: SeedContext,
  tasks: Map<string, CreatedTask>,
  files: { task: string; uploader: UserKey; filename: string; mimeType: string; content: string }[],
): Promise<number> {
  const storage = getStorage();
  let count = 0;
  for (const file of files) {
    const task = tasks.get(file.task);
    if (!task) continue;
    try {
      const buffer = Buffer.from(file.content, 'utf8');
      const extension = path.extname(file.filename).replace('.', '') || 'txt';
      const storedKey = `${ctx.projectId}/${randomUUID()}.${extension}`;
      await storage.put(storedKey, buffer);
      await prisma.attachment.create({
        data: {
          projectId: ctx.projectId,
          taskId: task.id,
          uploaderId: ctx.userIds[file.uploader],
          originalFilename: file.filename,
          storedKey,
          mimeType: file.mimeType,
          sizeBytes: buffer.byteLength,
          checksumSha256: createHash('sha256').update(buffer).digest('hex'),
          storageProvider: storage.kind,
        },
      });
      count += 1;
    } catch (error) {
      // Storage may be unavailable (e.g. S3 unconfigured); the demo still works.
      // eslint-disable-next-line no-console
      console.warn(`[seed:demo] Skipped attachment ${file.filename}:`, (error as Error).message);
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Reset — remove only the demo-owned data so re-runs are deterministic
// ---------------------------------------------------------------------------

async function resetDemoData(projectIds: string[], userIds: string[]): Promise<void> {
  await prisma.auditLog.deleteMany({ where: { metadata: { path: ['demo'], equals: true } } });

  await prisma.notification.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { projectId: { in: projectIds } }] },
  });
  await prisma.savedView.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.importJob.deleteMany({
    where: { OR: [{ createdById: { in: userIds } }, { projectId: { in: projectIds } }] },
  });

  const attachments = await prisma.attachment.findMany({
    where: { projectId: { in: projectIds } },
    select: { storedKey: true },
  });
  const storage = getStorage();
  for (const attachment of attachments) {
    try {
      await storage.delete(attachment.storedKey);
    } catch {
      // Orphaned blobs are harmless for a demo.
    }
  }

  await prisma.activityLog.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.task.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.milestone.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.label.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parsePassword(): string {
  const flagIndex = process.argv.indexOf('--password');
  const fromFlag = flagIndex !== -1 ? process.argv[flagIndex + 1] : undefined;
  const value = (fromFlag || process.env.SEED_DEMO_PASSWORD || 'Teamboard_Demo_2026!').trim();
  const problems = validatePasswordStrength(value);
  if (problems.length > 0) {
    throw new Error(`Demo password does not meet password requirements:\n  - ${problems.join('\n  - ')}`);
  }
  return value;
}

async function main(): Promise<void> {
  // 1. Base vocabularies + permission matrix.
  const base = await seedBaseData(prisma);
  const password = parsePassword();
  const passwordHash = await hashPassword(password);

  // 2. Demo accounts.
  const userIds = {} as Record<UserKey, string>;
  let usersCreated = 0;
  for (const user of DEMO_USERS) {
    const existing = await findActiveUserByEmail(user.email);
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { displayName: user.displayName, globalRole: user.globalRole, isActive: true, mustChangePassword: false, timezone: env.SEED_TIMEZONE },
      });
      userIds[user.key] = existing.id;
    } else {
      const created = await prisma.user.create({
        data: {
          email: user.email,
          displayName: user.displayName,
          passwordHash,
          globalRole: user.globalRole,
          timezone: env.SEED_TIMEZONE,
          isActive: true,
          mustChangePassword: false,
        },
      });
      userIds[user.key] = created.id;
      usersCreated += 1;
    }
  }

  // 3. Vocabulary lookups.
  const [statuses, priorities, types, projectStatuses] = await Promise.all([
    prisma.taskStatus.findMany(),
    prisma.taskPriority.findMany(),
    prisma.taskType.findMany(),
    prisma.projectStatus.findMany(),
  ]);
  const statusIds = new Map<StatusKey, string>(statuses.map((row) => [row.key as StatusKey, row.id]));
  const statusCategories = new Map<string, string>(statuses.map((row) => [row.key, String(row.category)]));
  const priorityIds = new Map<PriorityKey, string>(priorities.map((row) => [row.key as PriorityKey, row.id]));
  const typeIds = new Map<TypeKey, string>(types.map((row) => [row.key as TypeKey, row.id]));
  const projectStatusByKey = new Map<string, string>(projectStatuses.map((row) => [row.key, row.id]));

  const adminEmail = env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const admin = adminEmail ? await findActiveUserByEmail(adminEmail) : null;

  // 4. Projects.
  interface ProjectDef {
    code: string;
    name: string;
    description: string;
    statusKey: string;
    priorityKey: PriorityKey;
    weighting: 'COUNT' | 'HOURS';
    start: number;
    target: number;
    labels: DemoLabel[];
    milestones: DemoMilestone[];
    members: { user: UserKey; role: 'MANAGER' | 'DEVELOPER' | 'VIEWER' }[];
  }

  const mainCode = (env.SEED_PROJECT_CODE || 'WEBAPP').toUpperCase();
  const projectDefs: ProjectDef[] = [
    {
      code: mainCode,
      name: 'Web App Platform',
      description: 'The internal team tracker itself — authentication, projects, tasks, board, reporting and imports.',
      statusKey: 'ACTIVE',
      priorityKey: 'HIGH',
      weighting: 'HOURS',
      start: -62,
      target: 45,
      labels: MAIN_LABELS,
      milestones: MAIN_MILESTONES,
      members: [
        { user: 'maya', role: 'MANAGER' },
        { user: 'leo', role: 'DEVELOPER' },
        { user: 'amara', role: 'DEVELOPER' },
        { user: 'daniel', role: 'DEVELOPER' },
        { user: 'sofia', role: 'VIEWER' },
      ],
    },
    {
      code: 'MOBILE',
      name: 'Mobile Companion App',
      description: 'A React Native companion for on-the-go updates, offline work and push notifications.',
      statusKey: 'PLANNING',
      priorityKey: 'MEDIUM',
      weighting: 'COUNT',
      start: 5,
      target: 95,
      labels: MOBILE_LABELS,
      milestones: MOBILE_MILESTONES,
      members: [
        { user: 'maya', role: 'MANAGER' },
        { user: 'amara', role: 'DEVELOPER' },
        { user: 'daniel', role: 'DEVELOPER' },
        { user: 'sofia', role: 'VIEWER' },
      ],
    },
  ];

  const projectIds: string[] = [];
  const projectByCode = new Map<string, { id: string; def: ProjectDef }>();

  for (const def of projectDefs) {
    let project = await prisma.project.findFirst({ where: { code: def.code, deletedAt: null } });
    if (project) {
      project = await prisma.project.update({
        where: { id: project.id },
        data: {
          name: def.name,
          description: def.description,
          statusId: projectStatusByKey.get(def.statusKey)!,
          priorityId: priorityIds.get(def.priorityKey)!,
          managerId: userIds.maya,
          startDate: dateOnly(def.start),
          targetDate: dateOnly(def.target),
          progressWeighting: def.weighting,
          isArchived: false,
          archivedAt: null,
          deletedAt: null,
          createdById: admin?.id ?? userIds.maya,
        },
      });
    } else {
      project = await prisma.project.create({
        data: {
          code: def.code,
          name: def.name,
          description: def.description,
          statusId: projectStatusByKey.get(def.statusKey)!,
          priorityId: priorityIds.get(def.priorityKey)!,
          managerId: userIds.maya,
          startDate: dateOnly(def.start),
          targetDate: dateOnly(def.target),
          progressWeighting: def.weighting,
          createdById: admin?.id ?? userIds.maya,
        },
      });
    }
    projectIds.push(project.id);
    projectByCode.set(def.code, { id: project.id, def });
  }

  // 5. Reset only demo-owned rows (idempotent re-runs).
  await resetDemoData(projectIds, Object.values(userIds));

  // 6. Build showcase content.
  const activityRows: Prisma.ActivityLogCreateManyInput[] = [];
  const auditRows: Prisma.AuditLogCreateManyInput[] = [];

  let membersAdded = 0;
  let milestonesCreated = 0;
  let labelsCreated = 0;
  let tasksCreated = 0;
  let subtasksCreated = 0;
  let commentsCreated = 0;
  let dependenciesCreated = 0;
  let viewsCreated = 0;
  let notificationsCreated = 0;
  let attachmentCount = 0;

  for (const { id: projectId, def } of projectByCode.values()) {
    const producer = admin?.id ?? userIds.maya;
    const producerName = admin?.displayName ?? 'Maya Patel';

    // Members.
    for (const member of def.members) {
      await prisma.projectMember.create({
        data: { projectId, userId: userIds[member.user], projectRole: member.role, addedById: producer },
      });
      membersAdded += 1;
      activityRows.push({
        projectId,
        actorUserId: producer,
        actorNameSnapshot: producerName,
        action: 'MEMBER_ADDED',
        field: 'member',
        newValue: DEMO_USERS.find((user) => user.key === member.user)!.displayName,
        metadata: toJson({ role: member.role }),
        createdAt: timestamp(def.start + 1, 10, 0),
      });
    }

    // Labels.
    const labelIds = new Map<string, string>();
    for (const label of def.labels) {
      const created = await prisma.label.create({
        data: { projectId, name: label.name, color: label.color, createdById: producer },
      });
      labelIds.set(label.name, created.id);
      labelsCreated += 1;
    }

    // Milestones.
    const milestoneIds = new Map<string, string>();
    for (const [index, milestone] of def.milestones.entries()) {
      const created = await prisma.milestone.create({
        data: {
          projectId,
          name: milestone.name,
          targetDate: dateOnly(milestone.target),
          status: milestone.status,
          completedAt: milestone.completed !== undefined ? timestamp(milestone.completed, 17, 0) : null,
          sortOrder: index,
        },
      });
      milestoneIds.set(milestone.name, created.id);
      milestonesCreated += 1;
      activityRows.push({
        projectId,
        actorUserId: producer,
        actorNameSnapshot: producerName,
        action: 'MILESTONE_CREATED',
        newValue: milestone.name,
        metadata: toJson({ target: dateOnly(milestone.target).toISOString().slice(0, 10) }),
        createdAt: timestamp(def.start, 10, 30),
      });
      if (milestone.status === 'COMPLETED') {
        activityRows.push({
          projectId,
          actorUserId: producer,
          actorNameSnapshot: producerName,
          action: 'MILESTONE_COMPLETED',
          newValue: milestone.name,
          metadata: toJson({}),
          createdAt: timestamp(milestone.completed ?? -10, 17, 5),
        });
      }
    }

    const ctx: SeedContext = {
      code: def.code,
      projectId,
      weighting: def.weighting,
      userIds,
      statusIds,
      statusCategories,
      priorityIds,
      typeIds,
      milestoneIds,
      labelIds,
      defaultReporter: 'maya',
    };

    const taskDefs = def.code === mainCode ? MAIN_TASKS : MOBILE_TASKS;
    const tasks = await createTasks(ctx, taskDefs, activityRows, auditRows);
    tasksCreated += [...tasks.values()].filter((task) => !task.isSubtask).length;
    subtasksCreated += [...tasks.values()].filter((task) => task.isSubtask).length;

    const commentDefs = def.code === mainCode ? MAIN_COMMENTS : MOBILE_COMMENTS;
    notificationsCreated += await seedComments(ctx, tasks, commentDefs, activityRows, auditRows);
    commentsCreated += commentDefs.length;

    const dependencyPairs = def.code === mainCode ? MAIN_DEPENDENCIES : MOBILE_DEPENDENCIES;
    await seedDependencies(ctx, tasks, dependencyPairs, activityRows);
    dependenciesCreated += dependencyPairs.length;

    const viewDefs = def.code === mainCode ? MAIN_SAVED_VIEWS : MOBILE_SAVED_VIEWS;
    viewsCreated += await seedSavedViews(ctx, viewDefs);

    if (def.code === mainCode) {
      notificationsCreated += await seedNotifications(ctx, tasks, MAIN_NOTIFICATIONS);
    }

    if (def.code === mainCode) {
      attachmentCount += await seedAttachments(ctx, tasks, [
        {
          task: 'Documentation: README, API and security',
          uploader: 'daniel',
          filename: 'release-checklist.md',
          mimeType: 'text/markdown',
          content:
            '# v1.0 release checklist\n\n- [x] Authentication and sessions hardened\n- [x] IDOR/BOLA test suite green\n- [ ] Production compose verified\n- [ ] Release notes published\n',
        },
        {
          task: 'Spreadsheet import wizard',
          uploader: 'maya',
          filename: 'import-template.csv',
          mimeType: 'text/csv',
          content: 'Area,Task,Owner,Priority,Status,Due date,Completed date,Blocker / next step,Reference link\n',
        },
        {
          task: 'Kanban board with pointer and keyboard drag',
          uploader: 'amara',
          filename: 'board-keyboard-notes.txt',
          mimeType: 'text/plain',
          content: 'Keyboard DnD: Space to lift, arrows to move, Space to drop, Escape to cancel.\nScreen reader: announce column and position on every move.\n',
        },
      ]);
    }
  }

  // 7. Project-level activity "created" events.
  for (const { id: projectId, def } of projectByCode.values()) {
    activityRows.push({
      projectId,
      actorUserId: admin?.id ?? userIds.maya,
      actorNameSnapshot: admin?.displayName ?? 'Maya Patel',
      action: 'PROJECT_CREATED',
      newValue: def.name,
      metadata: toJson({ code: def.code }),
      createdAt: timestamp(def.start - 1, 9, 0),
    });
  }

  await prisma.activityLog.createMany({ data: activityRows });

  // 8. A little audit history for the audit viewer.
  const demoAudit: Prisma.AuditLogCreateManyInput[] = [
    ...auditRows,
    ...DEMO_USERS.map((user, index) => ({
      actorUserId: userIds[user.key],
      actorEmail: user.email,
      action: 'LOGIN' as const,
      resourceType: 'session',
      metadata: toJson({ demo: true }),
      ip: '203.0.113.10',
      userAgent: 'Mozilla/5.0 (demo seed)',
      createdAt: timestamp(-3 + index, 8, 30),
    })),
    {
      actorUserId: userIds.maya,
      actorEmail: DEMO_USERS.find((u) => u.key === 'maya')!.email,
      action: 'VOCABULARY_CHANGED' as const,
      resourceType: 'task_status',
      metadata: toJson({ demo: true, note: 'Seeded configurable statuses' }),
      ip: '203.0.113.10',
      userAgent: 'Mozilla/5.0 (demo seed)',
      createdAt: timestamp(-20, 11, 0),
    },
    {
      actorUserId: userIds.maya,
      actorEmail: DEMO_USERS.find((u) => u.key === 'maya')!.email,
      action: 'IMPORT_COMMITTED' as const,
      resourceType: 'import_job',
      metadata: toJson({ demo: true, rows: 31, project: mainCode }),
      ip: '203.0.113.10',
      userAgent: 'Mozilla/5.0 (demo seed)',
      createdAt: timestamp(-7, 15, 0),
    },
  ];
  await prisma.auditLog.createMany({ data: demoAudit });

  // 9. Viewer membership notification (shows a non-task notification type).
  await prisma.notification.create({
    data: {
      userId: userIds.sofia,
      type: 'PROJECT_MEMBER_ADDED',
      title: `You were added to ${projectDefs[0].name}`,
      body: 'Maya Patel added you as a viewer on the project.',
      entityType: 'project',
      entityId: projectIds[0],
      projectId: projectIds[0],
      isRead: false,
      createdAt: timestamp(-30, 9, 15),
    },
  });
  notificationsCreated += 1;

  // eslint-disable-next-line no-console
  console.log(
    [
      '[seed:demo] Demo workspace ready.',
      `  base:         ${base.projectStatuses} project statuses, ${base.taskStatuses} task statuses, ${base.permissions} permissions`,
      `  users:        ${DEMO_USERS.length} demo accounts (${usersCreated} created)`,
      `  projects:     ${projectDefs.map((def) => `${def.code} "${def.name}"`).join(', ')}`,
      `  members:      ${membersAdded}`,
      `  labels:       ${labelsCreated}`,
      `  milestones:   ${milestonesCreated}`,
      `  tasks:        ${tasksCreated} (+ ${subtasksCreated} subtasks)`,
      `  dependencies: ${dependenciesCreated}`,
      `  comments:     ${commentsCreated}`,
      `  saved views:  ${viewsCreated}`,
      `  notifications:${notificationsCreated}`,
      `  attachments:  ${attachmentCount}`,
      `  sign in with: ${DEMO_USERS.map((user) => user.email).join(', ')}`,
      `  password:     ${password}`,
    ].join('\n'),
  );
}

main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[seed:demo] Failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
