# Database Documentation

PostgreSQL 16, managed by Prisma migrations (`backend/prisma/migrations`). This
document describes the model, the invariants enforced in SQL, and the
operational procedures (migrations, seeding, backup and restore).

---

## 1. Conventions

| Convention | Detail |
|---|---|
| Primary keys | `uuid` (`gen_random_uuid()`), except join tables which use a composite primary key |
| Timestamps | `timestamptz(6)`; date-only columns (start/due/target) use `date` and are serialised as `YYYY-MM-DD` |
| Soft delete | `deleted_at` on users, projects, tasks, milestones, labels, comments, attachments. Queries filter it explicitly; hard deletes exist only for admin purge operations |
| Money | none; hours are `numeric(6,2)` |
| Fixed infrastructure values | Postgres enums (`GlobalRole`, `AuditAction`, `ActivityAction`, `ImportStatus`, …) |
| User-configurable vocabularies | lookup tables (`task_statuses`, `task_priorities`, `task_types`, `project_statuses`) with a stable `key` plus a workflow `category` |
| Keys | Tasks carry a per-project `number` and a unique `key` (`WEBAPP-142`) allocated inside the creation transaction |

## 2. Entity map

### Identity and security

| Table | Purpose | Notable constraints |
|---|---|---|
| `users` | Accounts, global role, lockout counters | Partial unique index on `email` where `deleted_at IS NULL`; `email` is `citext` so addresses are case-insensitive |
| `sessions` | Opaque session tokens (SHA-256 hashed) with CSRF hash | Unique `token_hash`; absolute + idle expiry columns |
| `password_reset_tokens` | Single-use reset tokens (hashed) | Unique `token_hash` |
| `permissions` / `role_permissions` | Permission catalogue and role matrix | `permissions.key` unique; `(role, permission_id)` unique |
| `audit_logs` | Append-only security trail | Actor FK `ON DELETE SET NULL` plus `actor_email` snapshot; no mutating API exists |
| `mail_outbox` | Outbound messages (password resets) until SMTP is configured | — |

### Projects and work

| Table | Purpose | Notable constraints |
|---|---|---|
| `projects` | Project header, schedule, cached progress | Unique active `code` (partial index), `code ~ '^[A-Z][A-Z0-9]{1,9}$'`, `target_date >= start_date`, `progress` 0–100 |
| `project_members` | Per-project role (`MANAGER`/`DEVELOPER`/`VIEWER`) | PK `(project_id, user_id)` |
| `milestones` | Delivery checkpoints; progress derived from linked tasks | Unique `(project_id, lower(name))` where not deleted |
| `labels` | Project labels and global labels (`project_id IS NULL`) | Two partial unique indexes (per project, and global) |
| `tasks` | Work items, subtasks (`parent_task_id`), status/priority/type, assignee/reporter, dates, hours, progress, code references | Unique `(project_id, number)` and `key`; `progress` 0–100; hours ≥ 0; `due_date >= start_date`; `key` format check; GIN trigram indexes on title/description |
| `task_labels` | Task ↔ label | PK `(task_id, label_id)` |
| `task_dependencies` | "blocked by" edges | Unique `(task_id, depends_on_task_id)`, `task_id <> depends_on_task_id`; cycles rejected in-transaction by a recursive CTE |
| `comments` / `comment_mentions` | Discussion and `@mentions` | `char_length(body)` 1–10000 |
| `attachments` | File metadata; blobs live behind a storage provider | `size_bytes >= 0`; must reference a task or comment; storage keys are server-generated |
| `notifications` | In-app inbox | Unique `dedupe_key` makes scheduled reminders idempotent per day |
| `activity_logs` | Human-readable project/task feed | Actor snapshot; cascades with the project |
| `saved_views` | Personal filter presets | Unique per user/scope/name (case-insensitive) |
| `import_jobs` / `import_rows` | Spreadsheet migration state and per-row validation | Unique `(job_id, row_number)`; `row_hash` for duplicate detection |

### Key indexes

- `tasks`: `(project_id, status_id)`, `(project_id, assignee_id)`, `(assignee_id, due_date)`, open-work partial index on `due_date`, trigram indexes for search.
- `notifications`: `(user_id, is_read, created_at DESC)` plus a partial index for unread.
- `audit_logs`: `(created_at DESC)`, `(resource_type, resource_id)`, `(actor_user_id)`.
- `activity_logs`: `(project_id, created_at DESC)`, `(task_id, created_at DESC)`.

## 3. Derived values (computed, never stored twice)

| Value | Rule |
|---|---|
| Task progress | With subtasks: share of non-cancelled subtasks in a `DONE` category (auto). Leaf task: manual progress, forced to 100% while Done and capped at 99% when reopened |
| Project progress | Average of top-level, non-cancelled task progress; weighted by estimated hours when the project uses `HOURS` weighting (tasks without estimates keep weight 1) |
| Milestone progress | Average progress of linked non-cancelled tasks, with linked/overdue counts |
| Blocked state | `BLOCKED` status category **or** any dependency not in `DONE`/`CANCELLED` |
| Overdue | `due_date < today` and status category not Done/Cancelled |

## 4. Migrations

```bash
cd backend
npx prisma migrate dev --name <change>   # create + apply in development
npx prisma migrate deploy                # apply in CI/production (runs in the compose migrate service)
npx prisma migrate status                # inspect drift
```

Raw SQL steps that Prisma cannot express (extensions, `CHECK` constraints,
partial unique indexes, GIN indexes, generated `key` expression) are appended to
the migration files and are visible in `prisma/migrations/*/migration.sql`.

Current migrations:

| Migration | Adds |
|---|---|
| `20260925021856_init` | Identity, sessions, audit, mail outbox, permissions, vocabularies + `citext`/`pg_trgm`/`pgcrypto` extensions |
| `20260925025408_projects_and_members` | Projects, members, milestones, labels, saved views, activity logs |
| `20260925033244_tasks` | Tasks, task labels, task progress enum, trigram indexes |
| `20260925042758_collaboration` | Comments, mentions, attachments, notifications |
| `20260925045124_task_dependencies` | Dependency edges |
| `2026092505*_spreadsheet_import` | Import jobs and rows |

## 5. Seeding

`npm run db:seed` (or the compose `migrate` service) is idempotent and creates:

- 5 project statuses, 8 task statuses, 4 priorities, 8 task types
- 33 permissions and the role → permission matrix
- the bootstrap administrator from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
  (must change password on first sign-in; the seed refuses weak passwords)

## 6. Backup and restore

```bash
# Compressed logical backup (custom format) with retention
./scripts/backup-db.sh                       # → backups/teamboard-<timestamp>.dump

# Restore into a fresh database
docker compose exec -T db psql -U teamboard -d postgres -c 'CREATE DATABASE restore_test;'
docker compose exec -T db pg_restore -U teamboard -d restore_test --no-owner --no-privileges < backups/<file>.dump
docker compose exec -T db psql -U teamboard -d restore_test -c 'SELECT count(*) FROM tasks;'
```

A restore drill was executed against this project: the dump restored with
matching row counts (users, projects, tasks, audit rows, vocabularies,
permissions). Schedule `backup-db.sh` daily in production and store dumps off
the database volume.

## 7. Data integrity notes

- Deleting a task (soft) removes its dependency edges so the graph stays clean.
- Deleting a user (soft) revokes sessions, removes project memberships and
  clears project manager references; the audit trail keeps the actor email.
- Purging a project hard-deletes its tasks, members, milestones, labels, views
  and activity (FK `ON DELETE CASCADE`); audit rows survive with `SetNull`.
- Imported rows keep `raw`, `normalized` and `errors` so an administrator can
  audit exactly what a spreadsheet contained after the fact.
