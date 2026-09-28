# TeamBoard

A production-oriented, internal **development project & task tracker** for software teams — a secure replacement for the team's Google Sheets tracker.

**Current status: all eight phases complete.** Authentication, users, roles, projects, tasks, Kanban board, collaboration, dependencies, scheduling, analytics, audit log and spreadsheet import/export — with Docker deployment, tests and documentation. — see the [roadmap](#roadmap) and [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## What works today (all phases)

- **Authentication** — sign in, sign out, session persistence, forced password change for seeded accounts, password reset by token, optional self-registration (disabled by default).
- **Sessions** — opaque 256-bit tokens stored only as SHA-256 hashes, delivered in `HttpOnly; Secure; SameSite=Lax` cookies with absolute + sliding idle expiry and server-side revocation.
- **Passwords** — Argon2id hashing and a strength policy (12+ characters, 3 character classes, no personal/common patterns).
- **CSRF** — double-submit token bound to the session row, plus an `Origin` allowlist for all state-changing requests.
- **Abuse protection** — per-IP global rate limiting, per-IP+email login limiter with account lockout after 10 failed attempts, password-reset limiter.
- **Audit log** — login, failed login, lockout, logout, password changes and resets recorded with actor, IP, user agent and metadata (append-only; no mutating API exists).
- **Security headers** — strict CSP, `nosniff`, `X-Frame-Options: DENY`, referrer policy, HSTS in production, no `X-Powered-By`.
- **Roles & permissions** — Admin / Project Manager / Developer / Viewer with 33 permissions seeded and enforced server-side; the frontend receives the permission list for UI gating only.
- **App shell** — responsive sidebar/topbar layout, light/dark/system theme, toasts, accessible forms, dashboard with account, security and implementation-status panels.
- **Users** — administrator user administration: create (with one-time temporary password), edit, activate/deactivate, change role, reset password, soft delete or purge; self-demotion, self-deactivation and last-admin removal are blocked.
- **Projects** — create/edit/archive/delete, project codes (`WEBAPP`), statuses, priorities, dates, manager assignment, automatic completion dates, and progress scaffolding for Phase 3 tasks.
- **Project membership** — per-project roles (Manager/Developer/Viewer) layered over global roles, with guards protecting the project manager.
- **Milestones and labels** — CRUD with per-project uniqueness, global labels, completion timestamps.
- **Activity feed** — every project change is recorded (who, what, from → to) and shown on the project page.
- **Project-scoped authorization** — a central access service resolves `user → project → role → permission` for every request; resources in projects you cannot see return 404, not 403.
- **Tasks** — per-project keys (`WEBAPP-1`), subtasks with presentational keys (`WEBAPP-1-2`), configurable status/priority/type, assignee (must have project access), reporter, dates, estimated/actual hours, labels, code references, next-step and verification notes.
- **Progress engine** — parent task progress derives from its non-cancelled subtasks; leaf tasks keep manual progress and auto-complete at 100% when their status reaches a Done category; project progress averages top-level tasks (optionally weighted by estimated hours), excluding cancelled work.
- **Optimistic concurrency** — every task carries a `version`; stale writes are rejected with `409` instead of silently overwriting another person's edit.
- **Task views** — project task list with URL-synced filters (status, priority, assignee, label, milestone, type, search by key/title, overdue, due range, progress, scope) plus a cross-project “My Tasks” page and a task detail page with inline editing and a per-task activity feed.
- **Kanban board** — drag & drop with pointer **and keyboard** (screen-reader announcements), per-column ordering persisted server-side, optimistic card movement that rolls back on rejection or `409` conflicts, quick-add per column, and a read-only board for viewers.
- **Saved views** — store the current filter combination per project, mark a default, apply or delete it; views are personal to the user.
- **Bulk actions** — select tasks in the list to set status, priority or assignee, or delete them at once. Every task is authorized individually and the whole request fails atomically if any id is out of scope.
- **Command palette** — `Ctrl/Cmd+K` (or the topbar search button) searches accessible tasks and projects and runs commands such as navigation, theme switching and administration screens.
- **Comments and mentions** — comments on every task with `@mention` autocomplete, highlighted mentions, and edit/delete by the author or a moderator. Mentioned teammates receive a dedicated notification.
- **Notifications** — in-app inbox with an unread badge and 60-second polling: assignments, status changes, comments, mentions, project membership, plus scheduled due-soon and overdue reminders (deduplicated per task/assignee/day). Mark one or all as read.
- **Attachments** — upload documents, images and logs (10 MB, magic-byte allowlist), download through an authorized endpoint that always forces a safe attachment response, delete by uploader or moderator.
- **Dependencies** — link tasks as blockers with cycle prevention (self, direct and transitive cycles are rejected, checked with a recursive CTE inside the transaction), “Waiting on DEV-101” badges on the board and list, a dependencies panel on the task page showing both directions, and a `blocked` filter. Cross-project links are allowed only when the caller can manage dependencies in both projects.
- **Milestones with derived progress** — milestone progress, linked-task counts and overdue counts are computed from the tasks attached to them.
- **Calendar** — month view of task due/start dates, milestone targets and project targets, with project and “only my tasks” filters; also available per project.
- **Timeline** — Gantt-style view with month ruler, progress bars, milestone markers, a today line and an explicit “unscheduled” rail so undated work never disappears.
- **Dashboard** — one aggregated endpoint scoped in SQL to accessible projects: project and task statistics by workflow category, overdue/due-today/due-this-week, unassigned and dependency-waiting counts, my work with recent activity, upcoming milestones and recent projects.
- **Team workload** — per-developer active/in-progress/blocked/overdue/done counts, estimated vs logged hours, a light/balanced/heavy load indicator, unassigned-work summary and an optional project filter.
- **Reports and analytics** — project completion, status/priority/type distributions, per-assignee workload, created vs completed trends, burndown against an ideal line, weekly velocity and average cycle time, rendered with dependency-free accessible SVG charts.
- **Audit log** — administrator-only, filterable by action, actor, resource and date range, paginated, with CSV export; append-only (no mutating routes exist) and every security-relevant action is recorded with actor, IP, user agent and metadata.
- **Spreadsheet import** — a four-step wizard (upload → map columns → preview/validate → commit) for CSV/TSV/XLSX files up to 10 MB and 5,000 rows. The header row is auto-detected even when a title/KPI block precedes it; the reference sheet's 31 rows migrate with statuses, priorities, areas (as labels), code references and verification notes preserved, and the hand-computed 74% completion matches the imported project progress (74.19%). Invalid rows are reported per field, duplicate rows/titles are skipped by default, and re-importing the same file is idempotent.
- **CSV export** — spreadsheet-shaped export of every task (including subtasks with their parent key, labels, milestones and dependencies) with formula-injection protection, gated on `export:run` plus project visibility.
- **Vocabulary administration** — administrators manage task statuses, priorities, types and project statuses from the UI: rename, recolour, reorder, set defaults, deactivate, and delete only when unused. Built-in entries cannot be deleted, defaults cannot be deactivated and at least one active entry is always enforced.
- **Infrastructure** — Docker Compose (dev + prod), PostgreSQL 16, Prisma migrations, OpenSSL development HTTPS, healthchecks, non-root production image.

Not yet implemented: SMTP delivery (password reset links are written to `mail_outbox` and logged in development), S3 storage (the local provider sits behind a `StorageProvider` interface), and the Prisma 7 upgrade (tracked in `docs/SECURITY.md` §6). The navigation shows these as disabled "Soon" items rather than pretending they exist.

---

## Technology

| Layer | Stack |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, Zustand (UI state), TanStack Query (server state), Axios, React Router |
| Backend | Node.js, Express, TypeScript, Prisma ORM, PostgreSQL 16, Zod validation, Pino logging |
| Security | Argon2id (`@node-rs/argon2`), opaque session cookies, CSRF double-submit, helmet, express-rate-limit |
| Infrastructure | Docker, Docker Compose, nginx (TLS termination in production), OpenSSL dev certificates |
| Testing | Vitest + Supertest (API integration against real PostgreSQL), Vitest + React Testing Library (frontend) |

---

## Quick start (Docker)

Requirements: Docker (with Compose v2) and, for certificate generation, OpenSSL or Docker.

```bash
# 1. Generate the local HTTPS certificate (certs/ is gitignored)
./scripts/generate-certs.sh

# 2. Create your environment file
cp .env.example .env
#    then edit .env — set POSTGRES_PASSWORD and SEED_ADMIN_PASSWORD

# 3. Start the whole stack
docker compose up --build
```

| Service | URL |
|---|---|
| Web app | https://localhost:5180 |
| API health | https://localhost:5180/api/health (also http://localhost:4000/api/health) |
| PostgreSQL | localhost:5432 |

Sign in with the `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from your `.env`. The seeded admin must change its password on first sign-in.

The browser will warn about the self-signed development certificate — that is expected; accept the exception and continue.

Stop the stack with `docker compose down` (add `-v` to also delete the database volume).

### Environment notes

- `SEED_ADMIN_PASSWORD` must satisfy the password policy (12+ characters, 3 of lowercase/uppercase/digits/symbols, and must not contain the email local part or display name). The seed script fails fast with a clear message if it does not.
- `COOKIE_SECURE=true` in development because the dev stack runs over HTTPS. Set it to `false` only if you deliberately run the SPA over plain HTTP.
- All secrets live in `.env` (gitignored). Nothing sensitive is passed to the frontend: only `VITE_*` values are bundled, and those contain no secrets.

---

## Local development without Docker

PostgreSQL 16 is required (a local server or `docker run --name teamboard-pg -e POSTGRES_USER=teamboard -e POSTGRES_PASSWORD=... -e POSTGRES_DB=teamboard -p 5432:5432 postgres:16-alpine`).

### Backend

```bash
cd backend
cp .env.example .env         # point DATABASE_URL at your database
npm install
npx prisma migrate deploy    # or `npx prisma migrate dev` while developing
npm run db:seed
npm run dev                  # http://localhost:4000
```

### Frontend

```bash
cd frontend
cp .env.example .env         # VITE_API_URL=/api, proxy target http://localhost:4000
npm install
npm run dev                  # https://localhost:5180 when ../certs exists, otherwise http
```

---

## Commands

| Location | Command | Purpose |
|---|---|---|
| `backend` | `npm run dev` | API with hot reload (`tsx watch`) |
| `backend` | `npm run build` / `npm start` | Compile and run the production bundle |
| `backend` | `npm run typecheck` | TypeScript project check |
| `backend` | `npm test` | Full API test suite (creates/migrates `DATABASE_URL_TEST`) |
| `backend` | `npm run test:coverage` | Coverage report |
| `backend` | `npx prisma migrate dev --name <name>` | Create a migration during development |
| `backend` | `npm run db:seed` | Idempotent seed (vocabularies, permissions, bootstrap admin) |
| `frontend` | `npm run dev` | Vite dev server (HTTPS when certificates exist) |
| `frontend` | `npm run build` | Type-check and produce `dist/` |
| `frontend` | `npm test` | Component/store tests |
| Root | `./scripts/generate-certs.sh` | OpenSSL development certificate |
| Root | `./scripts/backup-db.sh` | Compressed `pg_dump` with retention |
| Root | `docker compose up --build` | Development stack |
| Root | `docker compose -f docker-compose.prod.yml up -d --build` | Production stack (nginx + TLS) |

---

## Testing

```bash
cd backend && npm test     # 257 tests: auth, users, projects, tasks, board, collaboration, dependencies, calendar, dashboard, workload, analytics, audit, import/export, IDOR/BOLA
cd frontend && npm test    # 173 tests: login, projects, tasks, board, collaboration, dependencies, calendar, charts, dashboard, reports, audit, import wizard
```

CI (`.github/workflows/ci.yml`) runs typecheck, both test suites and production builds against a PostgreSQL service, and fails if a backend secret pattern appears in the frontend bundle.

The backend suite runs against a **real PostgreSQL database** (`DATABASE_URL_TEST`), applies migrations automatically via a Vitest global setup, and truncates/reseeds between tests. Authentication/authorization behaviour is verified against the HTTP layer with Supertest — not mocked. `tests/idor.test.ts` is the release gate: a member of project A must never reach project B's projects, members, milestones, labels, saved views or activity by id substitution.

---

## Security summary

Detailed threat model and checklist: [`ARCHITECTURE.md` §10](./ARCHITECTURE.md#10-security-plan).

- No secrets in the frontend bundle (verified by scan during the security review).
- Sessions are server-side revocable; changing or resetting a password revokes all sessions.
- Login responses are uniform for unknown accounts (timing-equalized with a dummy Argon2 verification).
- Every state-changing request requires a matching CSRF token **and** an allow-listed `Origin`.
- Rate limits: global, login (failed attempts only), password reset, registration.
- Audit trail for all authentication events with IP/user-agent and JSON metadata.
- Database access only through Prisma's parameterized queries; raw SQL is limited to migrations and health checks.

---

## Project structure

```
TeamBoard/
├─ ARCHITECTURE.md            # requirements, schema, API, security, phases (source of truth)
├─ docker-compose.yml         # development stack (db + api + web)
├─ docker-compose.prod.yml    # production stack (nginx TLS, migrate job, volumes)
├─ .env.example               # all shared variables, documented
├─ docs/                       # API, security and database documentation
│  ├─ API.md                  # endpoint documentation
│  ├─ DATABASE.md             # schema, invariants, migrations, backup/restore
│  ├─ SECURITY.md             # threat model, controls, accepted risks
│  └─ openapi.yaml            # machine-readable API contract
├─ .github/workflows/ci.yml   # typecheck, tests, builds, secret scan
├─ scripts/                   # cert generation, database backup
├─ certs/                     # generated dev certificate (gitignored)
├─ backend/
│  ├─ prisma/schema.prisma    # data model + migrations + seed
│  ├─ src/config              # zod-validated environment
│  ├─ src/middleware          # auth, CSRF, rate limits, validation, errors, headers
│  ├─ src/modules/auth        # schemas, service, controller, routes
│  ├─ src/modules/users       # user administration, role changes, password resets
│  ├─ src/modules/projects    # projects, members, milestones, labels, saved views, DTOs
│  ├─ src/modules/tasks       # task CRUD, subtasks, status/assignee, board, bulk, filters, DTOs
│  ├─ src/modules/search      # command-palette search across tasks and projects
│  ├─ src/modules/comments    # comments with mentions, moderation rules
│  ├─ src/modules/notifications # inbox, triggers, deduplicated reminder sweep
│  ├─ src/modules/attachments # upload validation, authorized download, storage provider
│  ├─ src/modules/dependencies # blocker edges with recursive cycle prevention
│  ├─ src/modules/calendar    # cross-project calendar feed
│  ├─ src/modules/timeline    # per-project Gantt feed
│  ├─ src/modules/dashboard   # aggregated personal dashboard
│  ├─ src/modules/workload    # team workload aggregates
│  ├─ src/modules/analytics   # project analytics, burndown, velocity
│  ├─ src/modules/imports     # CSV/XLSX parsing, mapping, preview, commit
│  ├─ src/modules/exports     # spreadsheet-shaped CSV export
│  ├─ src/modules/audit       # append-only audit service, queries and CSV export
│  ├─ src/jobs                # reminder scheduler
│  ├─ src/modules/vocabularies# administrator configuration of statuses/priorities/types
│  ├─ src/modules/activity    # append-only project/task activity feed
│  ├─ src/modules/audit       # append-only audit service
│  ├─ src/modules/meta        # vocabularies (statuses, priorities, types)
│  ├─ src/lib                 # access control, resource guards, progress engine, permissions, passwords, tokens
│  └─ tests                   # Supertest suites + test database lifecycle
└─ frontend/
   ├─ src/app                 # providers, router, protected route, permission guard
   ├─ src/components          # ui primitives, layout, project/activity/task/board components, admin sections
   ├─ src/features            # auth, users, projects, tasks, vocabularies, meta
   ├─ src/pages               # login, dashboard, projects, task detail, my tasks, admin, settings
   ├─ src/stores              # Zustand UI + toast state
   └─ src/lib                 # axios client, query client, formatting, theme, activity text
```

---

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation, Docker, database, authentication, RBAC primitives, app shell | ✅ Complete |
| 2 | Users, roles, projects, members, milestones, labels, activity, project-scoped authorization | ✅ Complete |
| 3 | Tasks, subtasks, vocabularies, progress engine, my tasks, task detail | ✅ Complete |
| 4 | Kanban board, saved views, bulk actions, command palette, global search | ✅ Complete |
| 5 | Comments, mentions, notifications, reminders, attachments | ✅ Complete |
| 6 | Calendar, timeline, milestones, dependencies | ✅ Complete |
| 7 | Dashboard widgets, workload, analytics, reports, audit log viewer | ✅ Complete |
| 8 | Spreadsheet import/export, security review, production hardening, documentation | ✅ Complete |

---

## Migrating the reference spreadsheet

1. In Google Sheets open the tracker sheet and choose **File → Download → CSV**.
2. Sign in as an administrator and open **Administration → Import**.
3. Upload the file. The wizard detects the header row (the reference sheet has 8 title/KPI rows above it) and auto-maps the columns:

| Spreadsheet column | Target field |
|---|---|
| `Area` | Label (project labels are created when missing) |
| `Task` | Title |
| `Owner` | Assignee (matched to project members by name or email) |
| `Priority` / `Status` | Priority / status (case-insensitive; unknown values are reported) |
| `Due date` / `Completed date` | Due / completion date (ISO, M/D/YYYY or Excel serial; roll-over dates are rejected) |
| `Blocker / next step` | `Verified`/`-` become the verification note, everything else the next step |
| `Reference link` | Code references (split on `;`, `-` placeholders ignored) |

4. Choose the target project, review the preview (valid/invalid/skipped counts and per-row errors), then commit.
5. The report lists the created task keys; **Export CSV** on the project page produces a round-trippable file.

## Production deployment

```bash
./scripts/generate-certs.sh          # or mount real certificates into ./certs
cp .env.example .env                 # set strong POSTGRES_PASSWORD and SEED_ADMIN_PASSWORD
docker compose -f docker-compose.prod.yml up -d --build
```

- nginx terminates TLS on ports 80/443, serves the built SPA and proxies `/api` to the API container.
- The API and database are **not** published on the host; only nginx is reachable.
- A one-shot `migrate` container applies migrations and seeds base data before the API starts.
- The API runs as a non-root user on a distroless-style minimal image with no dev dependencies.
- Replace `certs/dev.crt`/`certs/dev.key` with certificates issued by your CA (the file names are referenced by `frontend/nginx.conf`).

### Backup and restore

```bash
./scripts/backup-db.sh                                    # writes backups/teamboard-<timestamp>.dump
# Restore into a scratch database and verify
 docker compose exec -T db psql -U teamboard -d postgres -c 'CREATE DATABASE restore_test;'
docker compose exec -T db pg_restore -U teamboard -d restore_test --no-owner --no-privileges < backups/<file>.dump
```

A restore drill has been executed against this project: the dump restored with matching counts for users, projects, tasks, audit rows, vocabularies and permissions. See `docs/DATABASE.md` §6 for the full procedure.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Browser warns "not secure" | Expected with the self-signed development certificate. |
| `SEED_ADMIN_PASSWORD does not meet password requirements` | Use 12+ characters with 3 character classes that do not contain the email local part or display name. |
| Port already in use | Change `DB_PORT`, `API_PORT` or `WEB_PORT` in `.env`. |
| Web container cannot reach the API | Ensure `api` is healthy: `docker compose ps`, then `docker compose logs api`. |
| Logged out unexpectedly | Sessions expire after `SESSION_IDLE_HOURS` of inactivity; sign in again. |
| API returns "Cannot read properties of undefined" or unknown-model errors after a schema change | The generated Prisma client is stale. `docker compose up -d api` recreates the container and runs `prisma generate` automatically; `docker compose restart` reuses the container and does not pick up compose-file changes. |
| Backend edits do not take effect in the dev container | The dev API runs `nodemon --legacy-watch` (polling) because file-change events do not cross Windows bind mounts with `tsx watch`. If a change still does not appear, run `docker compose restart api`. |
| `sh: <package>: not found` after adding a dependency | The dev container installs dependencies at startup (`npm ci`), so this self-heals on `docker compose up -d api`. If it persists, recreate the volume: `docker compose stop api && docker compose rm -f api && docker volume rm teamboard_backend_node_modules && docker compose up -d api`. |
