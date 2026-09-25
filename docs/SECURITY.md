# Security Documentation

_Last reviewed: Phase 8 (spreadsheet import/export, production hardening). All eight phases implemented._

This document records the threat model, the controls in place, the per-resource
authorization model, the accepted risks with rationale, and the review checklist
used before each phase is considered done.

---

## 1. Threat model

| Asset | Threat | Control |
|---|---|---|
| Credentials | Offline cracking | Argon2id (m=19456 KiB, t=2, p=1), 12+ char policy |
| Sessions | Theft / replay / fixation | Opaque 256-bit tokens stored as SHA-256 hashes, `HttpOnly; Secure; SameSite=Lax` cookies, absolute + sliding idle expiry, rotation on login, revocation on logout/password change |
| Authorization | IDOR/BOLA — reaching another project's data by changing an id | Central access service; every resource resolves `resource → project → role → permission`; 404 for invisible resources |
| CSRF | Cross-site state changes | Double-submit token bound to the session row + `Origin` allowlist on all mutating requests + `SameSite=Lax` |
| Brute force | Credential stuffing, user enumeration | Per-IP+email login limiter, account lockout (10 failures → 15 min), uniform login responses, dummy Argon2 verification for unknown accounts |
| Uploads | Malicious files, stored XSS, path traversal, DoS | Content-type detection by magic bytes, allowlist, size limit, filename sanitisation, server-generated storage keys, downloads forced as attachments with `nosniff` + sandbox CSP |
| Spreadsheet import | Formula injection, malformed dates, duplicate rows, unbounded files | Rows are validated and previewed before anything is written; invalid rows are reported, never silently dropped; dates that would roll over are rejected; row hashes make re-imports idempotent; 10 MB / 5,000-row caps; exported cells starting with `= + - @` are prefixed with an apostrophe |
| SQL injection | Crafted identifiers | Prisma parameterised queries only; sort/filter fields come from allowlists; no dynamic identifiers |
| XSS | Comment/description payloads | React auto-escaping, no `dangerouslySetInnerHTML`, strict CSP, comments stored/rendered as text with mention spans only |
| Enumeration | Probing ids/emails | 404 for invisible resources, uniform forgot-password responses, no user listing outside admin/manager endpoints |
| DoS | Oversized payloads, expensive loops | JSON body limit 1 MB, upload limit, per-route rate limits, board/list pagination caps, bounded mention parsing |
| Auditability | Silent privilege use | Append-only `audit_logs` for auth and all sensitive mutations; project/task `activity_logs` for user-facing history |

---

## 2. Authorization model

Two levels, both evaluated on every request:

1. **Global role** — `ADMIN`, `PROJECT_MANAGER`, `DEVELOPER`, `VIEWER`.
2. **Project role** (project membership) — `MANAGER`, `DEVELOPER`, `VIEWER`.

Effective permission = maximum of both, `ADMIN` always maximum. Enforcement lives
in `backend/src/lib/access.ts` and `backend/src/lib/resourceGuards.ts`:

- `getProjectAccess(user, projectId)` — resolves access or `null`.
- `assertProjectPermission(user, projectId, permission)` — `404` when the project
  is invisible, `403` when visible but forbidden.
- `loadTaskForPermission`, `loadMilestoneForPermission`, `loadLabelForPermission`,
  `loadSavedViewForPermission`, `loadCommentForPermission` — resolve a resource id
  from the URL to its owning project and permission in one place.
- List endpoints scope in SQL using `accessibleProjectWhere` composed with `AND`
  so user filters can never widen the scope.

Direct `prisma.<model>.findUnique({ where: { id } })` in a request path is
forbidden; the IDOR test suite (`backend/tests/idor.test.ts`) is the release gate.

### Resource access matrix (summary)

| Resource | Visibility | Mutations | Notes |
|---|---|---|---|
| Project | member/manager/admin | `project:update`/`archive` (manager), `project:delete` (admin) | Manager change requires admin |
| Task | project members | `task:update`, `task:update_status`, `task:delete` (manager+), `task:assign` or self-assign | Assignee must have project access |
| Task dependency | project members (read) | `task:manage_dependencies` in **both** projects for cross-project edges | Cycles rejected in-transaction; deleted tasks drop their edges |
| Calendar / timeline | accessible projects only | read-only | SQL-scoped; `projectId` filters are authorized; 404 for invisible projects |
| Dashboard / workload / analytics | accessible projects only | read-only | Aggregates are scoped in SQL (`accessibleTaskWhere`), never fetched-then-filtered, so one team's numbers cannot appear in another user's dashboard; `projectId` filters are authorized |
| Audit log | `audit:view` (admin) only | append-only, no mutation routes | Includes actor, IP, user agent and metadata; CSV export reuses the same filters |
| Milestone / label | project members | `project:manage_milestones` / `project:manage_labels` | Label must belong to the project in the URL |
| Comment | project members | author (own, `comment:update_own`) or `comment:moderate` | Deletion allowed to author or moderator |
| Attachment | project members (`attachment:download`) | uploader (`attachment:delete_own`) or `attachment:moderate` | Downloads always authorized, never static |
| Saved view | owner only | owner or admin | 404 for everyone else |
| Notification | owner only | owner only | 404 when another user's id is used |
| User admin | `user:manage` (admin) | `role:manage` for roles | Self-demotion, self-deactivation, self-deletion and last-admin removal blocked |
| Vocabulary | `vocabulary:manage` (admin) | same | Built-ins undeletable, defaults protected, last active entry protected |

---

## 3. Authentication and session controls

- Opaque session tokens (256-bit), stored only as SHA-256 hashes.
- Cookies: `HttpOnly`, `Secure` (enabled in dev via `COOKIE_SECURE=true` over
  local HTTPS), `SameSite=Lax`, `Path=/`, max-age = `SESSION_TTL_HOURS`.
- Idle expiry (`SESSION_IDLE_HOURS`) refreshed at most every 5 minutes.
- Password change/reset and admin reset revoke all sessions (except the current
  one on self-service change).
- CSRF: 256-bit token, hashed in the session row, sent in `X-CSRF-Token`,
  compared with `timingSafeEqual`; `Origin` allowlist enforced on mutations.
- Rate limits: global, login (failed attempts only, IP+email key), password
  reset, registration; `Retry-After` returned on 429.
- Audit events: `LOGIN`, `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `LOGOUT`,
  `PASSWORD_CHANGED`, `PASSWORD_RESET_REQUESTED/COMPLETED`, `USER_*`.

---

## 4. File upload controls

1. Multer memory storage, one file, `MAX_UPLOAD_MB` limit (default 10 MB).
2. Type detection by **magic bytes** (`magic-bytes.js`), never by extension alone.
   Allowlist: PDF, PNG, JPEG, GIF, WEBP, ZIP, XLSX, DOCX. OOXML files are
   detected as ZIP and distinguished by extension only to label them.
3. Files with no recognisable signature are accepted only for text extensions
   (txt, md, csv, json, yaml, yml, log) **and** must contain no NUL bytes in the
   first 8 KB; binary content behind a `.txt` name is rejected.
4. Filenames are reduced to a basename, control characters and path separators
   are stripped, and the display name is capped at 200 characters.
5. Storage keys are server-generated (`<projectId>/<uuid>.<ext>`), validated
   against a strict pattern, resolved under `UPLOAD_DIR` and verified to stay
   inside it — user-supplied paths are never used.
6. Downloads require `attachment:download` **and** project access; responses set
   `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`,
   `Content-Security-Policy: sandbox; default-src 'none'`, `Cache-Control:
   private, no-store`.
7. SHA-256 checksums are stored for integrity/correlation; deletions soft-delete
   the row and remove the blob.
8. The `StorageProvider` interface isolates local disk today so object storage
   (S3) can replace it without touching services.

---

## 5. Notifications and data exposure

- Notifications are strictly per-user; `PATCH /notifications/:id/read` returns
  404 for another user's notification.
- Comment mention relationships are explicit (`mentionedUserIds`), validated
  server-side against active accounts with project access; mentions of users
  outside the project are ignored, and users are never notified about their own
  actions.
- Reminder sweeps dedupe per `(type, task, assignee, day)` through a unique
  `dedupeKey`, so repeated runs cannot spam.

---

## 6. Dependency advisories (accepted risks)

`npm audit` currently reports high-severity findings in `prisma` →
`@prisma/config` → `deepmerge-ts` (stack exhaustion when merging recursive
object graphs). Assessment:

- The vulnerable code path is the **Prisma CLI/config merge**, executed at build
  time with developer-controlled configuration. It is never reachable from API
  traffic, and the production runtime does not invoke the CLI.
- The advisory has no fix within the Prisma 6.x line; remediation requires
  Prisma 7 (breaking config/client changes). Tracked for the Phase 8 hardening
  pass, together with a full dependency review.

`file-type` was replaced with `magic-bytes.js` after an advisory (infinite loop
on malformed ASF input) affected every `file-type` release compatible with
CommonJS — the upload path is on all requests, so the parser had to be replaced
rather than accepted.

No other production dependency reports an advisory (`npm audit --omit=dev`).

---

## 7. Import and export controls

- Import endpoints are administrator-only (`import:run`) and split into
  **upload → preview → commit**; the preview validates every row and reports
  per-row errors, and the commit re-validates inside the same code path so what
  was reviewed is exactly what is written.
- The commit runs in a single transaction with a 120-second budget; task keys
  are allocated in one `task_sequence` update so a partially imported file can
  never produce duplicate keys.
- `row_hash` (SHA-256 of the mapped values) makes re-running the same file
  idempotent; duplicate titles inside a project are skipped by default and can be
  imported deliberately by turning the option off.
- CSV export neutralises spreadsheet formula injection, quotes/escapes every
  cell, and is gated on `export:run` plus project visibility.
- The audit log records every import stage with actor, filename, row counts and
  the target project.

## 8. Review checklist (applied per phase, final pass in Phase 8)

- [x] No IDOR/BOLA: every resource route resolves through the guard helpers; IDOR suite green.
- [x] No SQL injection: parameterised queries only; allowlisted sort/filter fields.
- [x] No secrets in the frontend bundle (scanned in Phase 1; re-checked in Phase 8).
- [x] No plaintext passwords or session tokens in the database, responses or logs.
- [x] No unrestricted uploads (magic-byte allowlist, size limit, sanitised names, authorized downloads).
- [x] No privilege escalation (admin-only user/role/vocabulary endpoints, self-action guards, last-admin guard).
- [x] No client-side-only authorization (denial tests exist for every role).
- [x] Secure cookies, CSRF, CORS allowlist, security headers, HTTPS in dev and prod.
- [x] Validation on every mutating endpoint and query (Zod, strict bodies).
- [x] Database constraints: FKs, checks, partial unique indexes, dense ordering constraints.
- [x] Audit coverage for authentication, admin actions and destructive operations.
- [x] Spreadsheet import validates before writing, is idempotent and cannot inject formulas into exports.
- [x] Backup/restore drill executed: `pg_dump` restored into a scratch database with matching counts.
- [x] Production stack rebuilt and smoke-tested (TLS, headers, login, import) from the production images.
- [x] Frontend bundle scanned for backend identifiers — only the word “Prisma” appears, in dashboard copy.
- [ ] Follow-up: upgrade Prisma to 7.x when the config/client migration is scheduled (see §6).
