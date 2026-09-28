# API Reference (Phases 1–7)

Base URL: `/api` (same origin; the SPA is served by Vite in development and nginx in production).

All endpoints return JSON with a consistent envelope. Authentication uses an
`HttpOnly` session cookie; state-changing requests require the `X-CSRF-Token`
header whose value matches the `teamboard_csrf` cookie and the server-side session.

---

## Response format

**Success**

```json
{
  "success": true,
  "data": {},
  "message": "Optional human-readable message",
  "meta": { "requestId": "uuid" }
}
```

**Error**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed.",
    "details": [{ "path": "email", "message": "Enter a valid email address.", "code": "invalid_string" }]
  },
  "meta": { "requestId": "uuid" }
}
```

### Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 / 422 | Invalid body, query, params or malformed JSON |
| `UNAUTHENTICATED` | 401 | Missing, expired or revoked session |
| `INVALID_CREDENTIALS` | 401 | Wrong password / unknown account / inactive account |
| `ACCOUNT_LOCKED` | 429 | Too many failed sign-ins; account temporarily locked |
| `CSRF_INVALID` | 403 | Missing or mismatched CSRF token |
| `FORBIDDEN` | 403 | Authenticated but not permitted (or disallowed Origin) |
| `NOT_FOUND` | 404 | Unknown route or resource not visible to the caller |
| `CONFLICT` | 409 | Unique/relational conflict |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `PAYLOAD_TOO_LARGE` | 413 | Body or upload too large |
| `INTERNAL_ERROR` | 500 | Unexpected server error (no details leaked in production) |

---

## Authentication & CSRF flow

1. `POST /api/auth/login` with credentials.
2. Server sets:
   - `teamboard_session` — `HttpOnly; Secure; SameSite=Lax` session token
   - `teamboard_csrf` — readable by JavaScript, bound to the session
3. The SPA reads `teamboard_csrf` and sends it as `X-CSRF-Token` on every
   `POST`/`PATCH`/`PUT`/`DELETE`.
4. Non-browser clients must send both the cookie and the header.

Every state-changing request with an `Origin` header must come from an origin in
`CORS_ORIGIN`; requests without an `Origin` header are non-browser clients and
are not subject to CSRF.

---

## Endpoints

### `GET /api/health`

Public liveness/readiness probe. No secrets are returned.

```json
{ "success": true, "data": { "status": "ok", "database": "up", "uptimeSeconds": 42, "version": "0.1.0" } }
```

Returns `503` with `"status": "degraded"` when the database is unreachable.

---

### `POST /api/auth/login`

Rate limited per IP + email (failed attempts only). Locks the account for
15 minutes after 10 failed attempts.

**Body**

```json
{ "email": "user@example.com", "password": "••••••••••••" }
```

**200** — sets session + CSRF cookies:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "displayName": "Dev User",
      "avatarUrl": null,
      "globalRole": "DEVELOPER",
      "timezone": "Asia/Manila",
      "mustChangePassword": false,
      "lastLoginAt": "2026-01-01T00:00:00.000Z",
      "permissions": ["project:view", "task:view", "..."]
    }
  },
  "message": "Signed in successfully."
}
```

**Errors:** `422` validation, `401 INVALID_CREDENTIALS` (uniform for unknown
accounts and wrong passwords), `429 ACCOUNT_LOCKED` or `429 RATE_LIMITED`.

---

### `POST /api/auth/logout`

Authenticated. Revokes the current session and clears cookies. **200**
`{ "success": true, "data": null }`.

### `GET /api/auth/me`

Authenticated. Returns `{ "user": { ... } }` for the current session, including
the permission list used for UI gating. **401** when the session is missing,
revoked, expired or the account is inactive.

### `POST /api/auth/password/change`

Authenticated. Revokes every other session on success.

**Body:** `{ "currentPassword": "…", "newPassword": "…" }`

**Errors:** `401 INVALID_CREDENTIALS` (wrong current password), `422` (policy
violations with per-field `details`).

### `POST /api/auth/password/forgot`

Rate limited. **Body:** `{ "email": "…" }`. Always returns **200** with the same
message whether or not the account exists (no account enumeration). When the
account exists, a single-use token (30 minutes) is written to the `mail_outbox`
table and the reset link is logged in development.

### `POST /api/auth/password/reset`

Rate limited. **Body:** `{ "token": "…", "newPassword": "…" }`. Consumes the
token (single use), revokes all sessions and records an audit entry.
**400** for invalid, used or expired tokens.

### `POST /api/auth/register`

Available only when `ENABLE_PUBLIC_REGISTRATION=true`; otherwise **404**
(feature hidden). Creates a `VIEWER` account and signs it in. Rate limited.

---

## Data conventions

- Timestamps are ISO-8601 UTC; the client renders them in the user's timezone.
- Identifiers are UUIDs; request validation rejects malformed ids (`422`).
- Unknown body fields are rejected (strict schemas), preventing mass assignment.
- List endpoints (added in later phases) use `page`/`pageSize` and return
  pagination metadata in `meta`.

---

## Security notes for integrators

- Never store the session token anywhere except the cookie jar; it is not
  returned in JSON.
- Do not cache authenticated responses in shared caches (`Set-Cookie` and
  session checks make them user-specific).
- `403` is returned only when the caller may know the resource exists; resources
  the caller cannot see return `404` by design.

---

# Phase 2 — users, projects and project resources

All endpoints below require a session. Project-scoped endpoints resolve
`resource → project → membership role → permission` on the server for every
request; an id belonging to a project the caller cannot see yields `404`.

## Users (administrator)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/users` | `user:manage` | `?search=&role=&isActive=&page=&pageSize=`; paginated |
| POST | `/api/users` | `user:manage` | Creates a user; returns a one-time `temporaryPassword` when none is supplied |
| GET | `/api/users/:userId` | `user:manage` | Single account |
| PATCH | `/api/users/:userId` | `user:manage` | `displayName`, `timezone`, `avatarUrl`, `isActive` |
| PATCH | `/api/users/:userId/role` | `role:manage` | Self-demotion and last-admin removal are refused |
| POST | `/api/users/:userId/reset-password` | `user:manage` | Revokes sessions, forces change, returns a one-time password |
| DELETE | `/api/users/:userId` | `user:manage` | Soft delete by default; `?purge=true` permanently deletes |
| GET | `/api/users/lookup` | `project:manage_members` or `user:manage` | Minimal directory (`id`, `displayName`, `email`, `globalRole`, `avatarUrl`); requires `search` of at least 2 characters |

`POST /api/users` body: `{ email, displayName, globalRole, timezone?, password? }`.

## Projects

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/projects` | authenticated | Only projects the caller can see; `?search=&statusKey=&includeArchived=&page=&pageSize=` |
| POST | `/api/projects` | `project:create` | Body: `{ code, name, description?, statusId?, priorityId?, startDate?, targetDate?, managerId? }`; creator becomes manager (or a member when another manager is chosen) |
| GET | `/api/projects/:projectId` | `project:view` | Includes `myRole`, counts and progress |
| PATCH | `/api/projects/:projectId` | `project:update` | Code is immutable; completing a project stamps `actualCompletionDate` |
| DELETE | `/api/projects/:projectId` | `project:delete` (admin) | Soft delete; `?purge=true` removes it entirely |
| POST | `/api/projects/:projectId/archive` · `/unarchive` | `project:archive` | Archived projects are hidden by default |
| GET | `/api/projects/:projectId/activity` | `project:view` | Paginated feed: actor, action, field, old/new value, metadata |

## Project members

| Method | Path | Permission |
|---|---|---|
| GET | `/api/projects/:projectId/members` | `project:view` |
| POST | `/api/projects/:projectId/members` | `project:manage_members` |
| PATCH | `/api/projects/:projectId/members/:userId` | `project:manage_members` |
| DELETE | `/api/projects/:projectId/members/:userId` | `project:manage_members` |

Rules enforced server-side: only active accounts can be added; you cannot
change your own project role or remove yourself; only an administrator may
change or remove the project manager.

## Milestones

| Method | Path | Permission |
|---|---|---|
| GET | `/api/projects/:projectId/milestones` | `project:view` |
| POST | `/api/projects/:projectId/milestones` | `project:manage_milestones` |
| PATCH | `/api/projects/:projectId/milestones/:milestoneId` | `project:manage_milestones` |
| DELETE | `/api/projects/:projectId/milestones/:milestoneId` | `project:manage_milestones` |

Milestone names are unique per project (case-insensitive). Completing a
milestone stamps `completedAt`; reopening clears it.

## Labels

| Method | Path | Permission |
|---|---|---|
| GET | `/api/projects/:projectId/labels` | `project:view` |
| POST | `/api/projects/:projectId/labels` | `project:manage_labels` |
| PATCH | `/api/projects/:projectId/labels/:labelId` | `project:manage_labels` |
| DELETE | `/api/projects/:projectId/labels/:labelId` | `project:manage_labels` |

Labels with `projectId: null` are global (administrator-managed) and are
listed with every project but cannot be modified through a project route.

## Saved views

| Method | Path | Permission |
|---|---|---|
| GET | `/api/projects/:projectId/saved-views` | `project:view` (own views only) |
| POST | `/api/projects/:projectId/saved-views` | `project:view` |
| PATCH | `/api/projects/:projectId/saved-views/:viewId` | owner, or admin |
| DELETE | `/api/projects/:projectId/saved-views/:viewId` | owner, or admin |

Body: `{ name, filters, isDefault? }`; filters are an opaque JSON object capped
at 10 kB and unique names are enforced per project and user.

## Vocabularies

`GET /api/meta/vocabularies` — statuses, priorities, types and project statuses
for form dropdowns. Available to any authenticated user.

---

# Phase 3 — tasks, subtasks and vocabulary administration

Every task endpoint resolves `task → project → membership role → permission`;
tasks in projects the caller cannot see return `404`.

## Tasks

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/projects/:projectId/tasks` | `task:view` | Filters below; paginated |
| POST | `/api/projects/:projectId/tasks` | `task:create` | Allocates the next project key inside a transaction |
| GET | `/api/tasks/:taskId` | `task:view` | Detail with subtasks, labels, counts |
| PATCH | `/api/tasks/:taskId` | `task:update` | Requires `version`; `409` on stale writes |
| PATCH | `/api/tasks/:taskId/status` | `task:update_status` | `{ statusId, version }` |
| PATCH | `/api/tasks/:taskId/assignee` | `task:update` (+ `task:assign` for other people) | `{ assigneeId, version }` |
| POST | `/api/tasks/:taskId/subtasks` | `task:create` | `{ title }`; nesting is capped at two levels |
| GET | `/api/tasks/:taskId/activity` | `task:view` | Per-task activity feed |
| DELETE | `/api/tasks/:taskId` | `task:delete` | Soft-deletes the task and its subtasks |
| GET | `/api/my/tasks` | authenticated | Tasks assigned to the caller across accessible projects |

### Create/update body

```json
{
  "title": "Convert monitoring portal to React",
  "description": "…",
  "statusId": "uuid", "priorityId": "uuid", "typeId": "uuid",
  "assigneeId": "uuid-or-null", "milestoneId": "uuid-or-null",
  "startDate": "2026-09-01", "dueDate": "2026-09-30",
  "estimatedHours": 16, "actualHours": 3, "progress": 40,
  "nextStep": "Wire the dashboard", "verificationNote": "Verified in staging",
  "codeReferences": ["src/App.tsx:10-20"], "labelIds": ["uuid"],
  "version": 3
}
```

Rules enforced server-side: the assignee must be an active account with access
to the project; milestones and labels must belong to the project (or be global);
`progress` is refused on tasks that have subtasks; `parentTaskId` is immutable;
keys and numbers can never be set by clients.

### Filters (`GET …/tasks`)

`q` (key, title or description) · `status[]`, `priority[]`, `type[]` (keys) ·
`assignee[]`, `reporter[]`, `label[]`, `milestone[]` (ids) · `parentTaskId` ·
`scope=all|mine|unassigned` · `subtasks=all|top|only` · `overdue=true` ·
`includeCompleted=true|false` · `dueFrom`, `dueTo` · `progressMin`,
`progressMax` · `sort` (`-updatedAt`, `dueDate`, `-dueDate`, `-priority`,
`key`, `-createdAt`, `progress`) · `page`, `pageSize`.

Repeated parameters may also be comma-separated (`?status=TODO,DONE`).

### Progress semantics

- A task **with subtasks** reports `progressMode: "AUTO"` and its progress is the
  share of non-cancelled subtasks whose status category is `DONE`.
- A **leaf task** uses manual progress, forced to 100% while its status category
  is `DONE`; reopening it caps progress at 99%.
- **Project progress** averages top-level, non-cancelled tasks; when the project
  uses `HOURS` weighting it is weighted by estimated hours (tasks without an
  estimate keep a weight of 1).

## Vocabulary administration (administrators)

| Method | Path | Permission |
|---|---|---|
| GET | `/api/admin/vocabularies` | `vocabulary:manage` |
| POST | `/api/admin/vocabularies/:kind` | `vocabulary:manage` |
| PATCH | `/api/admin/vocabularies/:kind/:id` | `vocabulary:manage` |
| DELETE | `/api/admin/vocabularies/:kind/:id` | `vocabulary:manage` |

`kind` is one of `task-statuses`, `task-priorities`, `task-types`,
`project-statuses`. `DELETE` deactivates an entry; add `?hard=true` to delete an
unused, non-built-in entry permanently.

Guards: keys are generated and immutable; categories come from a fixed
workflow list; the current default cannot be deactivated; the last active entry
cannot be deactivated; built-in entries cannot be deleted and in-use entries
can only be deactivated. Every change writes an audit row.

---

# Phase 4 — Kanban board, bulk actions and search

## Kanban board

`GET /api/projects/:projectId/board` (`task:view`)

Returns one column per active task status (ordered by `sortOrder`), each with
its top-level tasks ordered by board position (`sortOrder`, then `number`):

```json
{
  "columns": [
    { "status": { "id": "…", "key": "TODO", "name": "To Do", "category": "TODO", "color": "#8b5cf6" },
      "tasks": [ { "id": "…", "key": "WEBAPP-1", "displayKey": "WEBAPP-1", "subtaskCount": 3, "completedSubtaskCount": 1, "…": "…" } ] }
  ],
  "totalTasks": 24,
  "truncated": false
}
```

Query parameters: `q`, `priority[]`, `assignee[]`, `label[]`, `milestone[]`,
`scope=all|mine|unassigned`, `includeCancelled=true`. The `CANCELLED` status is
hidden unless `includeCancelled=true`; the response is capped at 1,000 tasks and
sets `truncated: true` when the cap is hit.

## Board moves

`POST /api/tasks/:taskId/move` (`task:update_status`)

```json
{ "statusId": "uuid", "targetIndex": 2, "version": 7 }
```

The task is inserted at `targetIndex` in the target column (the index is
computed against the column *without* the moved task, matching drag-and-drop
semantics), the column is renumbered so positions stay dense, and status side
effects apply exactly as with `PATCH /status`. A stale `version` returns **409**
with a `CONFLICT` code so the client can refresh the board. Moving a task to a
`DONE` category completes it (100% for leaf tasks, completion timestamp set).

## Bulk actions

`POST /api/tasks/bulk` (`task:update`, `task:update_status` or `task:delete`
depending on the action)

```json
{ "taskIds": ["uuid", "uuid"], "action": "set-status", "statusId": "uuid" }
```

`action` is one of `set-status`, `set-priority`, `set-assignee` (`assigneeId:
null` unassigns) or `delete`. Limits: 1–50 tasks per request. Every selected
task is authorized individually — if any id belongs to a project the caller
cannot see, the whole request fails with **404** and nothing is updated. Each
affected task gets an activity entry; one audit row summarises the batch.

## Global search

`GET /api/search?q=<term>&limit=6` (authenticated)

Returns up to `limit` tasks and projects the caller can access, matched on task
key/title/description and project name/code. Requires at least two characters.
Scoping happens in SQL: no result from a project the user cannot see ever
touches the response.

---

# Phase 5 — comments, notifications and attachments

## Comments

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/tasks/:taskId/comments` | `task:view` | Paginated, oldest first |
| POST | `/api/tasks/:taskId/comments` | `comment:create` | `{ body, mentionedUserIds? }` |
| PATCH | `/api/comments/:commentId` | author (`comment:update_own`) or `comment:moderate` | Sets `editedAt` |
| DELETE | `/api/comments/:commentId` | author or `comment:moderate` | Soft delete; recorded in activity |

Mentions are sent explicitly as `mentionedUserIds` (the client inserts
`@Display Name` into the body) so a name can never be mis-resolved. The server
validates that each mentioned user is an active account with project access,
ignores self-mentions and non-members, stores `comment_mentions` rows and
creates `TASK_MENTIONED` notifications. New comments also notify the assignee
and reporter (`TASK_COMMENTED`), never the author.

## Notifications

| Method | Path | Notes |
|---|---|---|
| GET | `/api/notifications` | `?unreadOnly=true&page=&pageSize=`; `meta.unreadCount` included |
| PATCH | `/api/notifications/:notificationId/read` | `{ read: boolean }`; 404 for another user's row |
| POST | `/api/notifications/read-all` | Returns `{ updated }` |

Types: `TASK_ASSIGNED`, `TASK_STATUS_CHANGED`, `TASK_COMMENTED`,
`TASK_MENTIONED`, `TASK_DUE_SOON`, `TASK_OVERDUE`, `PROJECT_MEMBER_ADDED`.
Reminders come from a scheduler inside the API process (`SCHEDULER_ENABLED`,
`SCHEDULER_INTERVAL_MINUTES`, `DUE_SOON_DAYS`). Every reminder carries a
`dedupeKey` of `<type>:<taskId>:<userId>:<day>` enforced by a unique index, so
repeated sweeps or extra workers cannot duplicate notifications.

## Attachments

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/tasks/:taskId/attachments` | `attachment:download` | Paginated list |
| POST | `/api/tasks/:taskId/attachments` | `attachment:upload` | `multipart/form-data`, field `file` |
| GET | `/api/attachments/:attachmentId/download` | `attachment:download` | Authorized stream |
| DELETE | `/api/attachments/:attachmentId` | uploader (`attachment:delete_own`) or `attachment:moderate` | Soft delete + blob removal |

Upload rules: one file, `MAX_UPLOAD_MB` (default 10 MB), content type detected
from magic bytes against an allowlist (PDF, PNG, JPEG, GIF, WEBP, ZIP, XLSX,
DOCX, plus text-only TXT/MD/CSV/JSON/YAML/LOG), sanitised filename and a
server-generated storage key. Downloads always return
`Content-Disposition: attachment` with `nosniff` and a sandbox CSP, so a crafted
file can never execute in the browser. Metadata includes a SHA-256 checksum; the
storage key itself is never exposed.

---

# Phase 6 — dependencies, milestones, calendar and timeline

## Task dependencies

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/tasks/:taskId/dependencies` | `task:view` | Returns `{ blockedBy, blocks }` |
| POST | `/api/tasks/:taskId/dependencies` | `task:manage_dependencies` | `{ dependsOnTaskId }` |
| DELETE | `/api/tasks/:taskId/dependencies/:dependsOnTaskId` | `task:manage_dependencies` | Removes the edge |

Rules enforced in a transaction: a task cannot depend on itself; duplicates
return `409`; cycles (direct or transitive) return `422`. Cycle detection runs a
recursive CTE inside the same transaction as the insert. Cross-project edges
require `task:manage_dependencies` in **both** projects — a project the caller
cannot see yields `404`. Deleting a task removes its dependency edges so the
graph stays clean.

Blocked state is derived, never stored: a task is blocked when its status
category is `BLOCKED` or when any dependency is not `DONE`/`CANCELLED`. Task
payloads expose `blockedBy[]` and `isBlocked`, so the board, list and timeline
all show “Waiting on DEV-101” badges. The task list and board accept
`blocked=true`.

## Milestone progress

`GET /api/projects/:projectId/milestones` now returns, per milestone:
`taskCount`, `completedTaskCount`, `overdueTaskCount` and `progress` (average
progress of the linked, non-cancelled tasks). Linking or unlinking a task
updates these numbers on the next read.

## Calendar

`GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD` (authenticated)

Optional filters: `projectId`, `assignee[]`, `milestone[]`, `label[]`,
`status[]`, `scope=all|mine`, `includeCompleted`. Returns tasks that start or
end inside the window, milestones whose target falls inside it and projects
whose target falls inside it. Scoped in SQL to accessible projects; asking for a
project the caller cannot see returns `404`. An inverted range is rejected with
`422`. Capped at 500 rows per collection with a `truncated` flag.

## Timeline

`GET /api/projects/:projectId/timeline` (`task:view`)

Returns the project window, its milestones (with derived progress) and all
top-level non-cancelled tasks with their dates — including tasks without dates,
which the UI lists as “unscheduled”. Capped at 500 tasks with a `truncated`
flag; outsiders get `404`.

---

# Phase 7 — dashboard, workload, analytics and audit

## Dashboard

`GET /api/dashboard/summary` (authenticated)

One aggregated payload for the signed-in user, every number scoped in SQL to
accessible projects:

- `projects` — total, active, planning, on-hold, completed, archived, overdue
  (target date passed while not completed/archived)
- `tasks` — total plus per-category counts, `overdue`, `dueToday`,
  `dueThisWeek` (tomorrow through +7 days), `unassigned` (open work),
  `waitingOnDependencies`
- `myWork` — open/overdue/due-this-week counts plus the 5 most recently updated
  and 5 most recently created tasks assigned to or reported by the user
- `upcomingMilestones` — planned/in-progress milestones due in the next 30 days
- `recentProjects` — the 5 most recently updated accessible projects

## Team workload

`GET /api/team/workload?projectId=&includeCompleted=` (`workload:view`)

Per-user `activeTasks`, `inProgressTasks`, `blockedTasks`, `overdueTasks`,
`completedTasks`, `estimatedHours`, `actualHours`, plus a `loadScore` and
`loadLevel` (`low`/`medium`/`high`) derived from remaining estimate and overdue
weight. Also returns the unassigned bucket and totals. A `projectId` the caller
cannot access returns `404`; results are always scoped to accessible projects.

## Project analytics

`GET /api/projects/:projectId/analytics?days=30` (`report:view`, 7–180 days)

Returns completion counters (`total`, `done`, `open`, `cancelled`, `overdue`,
`blocked`, `unassigned`, `donePercent`), distributions by status/priority/type,
per-assignee workload including the unassigned bucket, daily `createdTrend` and
`completedTrend`, `burndown` with an ideal line, weekly `velocity` (8 weeks) and
`cycleTime` (average days from creation to completion, with sample size).
Cancelled tasks are excluded from progress and burndown maths. Outsiders get
`404`.

## Audit log

| Method | Path | Permission |
|---|---|---|
| GET | `/api/admin/audit-logs` | `audit:view` (admin) |
| GET | `/api/admin/audit-logs?format=csv` | `audit:view` (admin) |
| GET | `/api/admin/audit-logs/actions` | `audit:view` (admin) |

Filters: `action` (validated against the action catalogue), `actorEmail`
(substring), `resourceType`, `resourceId`, `from`, `to`, plus `page`/`pageSize`.
Rows are newest first and include actor email, resource, metadata, IP and user
agent. The CSV export reuses the same filters, is capped at 10,000 rows, quotes
and escapes values, and is served as an attachment with `nosniff`. The audit
trail is append-only: no mutating route exists for it.

