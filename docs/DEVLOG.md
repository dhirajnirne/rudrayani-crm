# Development Log

Task-by-task record of what was built, why, and how to see it working.
Phases and task numbers refer to the approved implementation plan (which follows
`rudrayani-crm-build-brief.md`).

---

## 2026-07-05 — Phase 0: Environment bring-up

**Goal:** make the existing scaffold actually run end-to-end on this machine.

### Changes
- Installed **Docker Desktop 4.80** (was missing — the DB had nowhere to run).
- Initialized the **git repository** with `.gitignore`; committed the scaffold.
- Started **Postgres 16 + PostGIS** and **Adminer** via `docker compose up -d`.
- Backend: created `.env` from `.env.example`, ran `npm install`, added the
  missing `xlsx` dependency (the seed script needed it but package.json lacked it).
- Applied the full schema (`backend/src/migrations/001_init.sql`) — 12 tables
  including the PostGIS `location_pings` and `attendance` tables.
- Seeded the agency row **"Rudrayani Fintech"**
  (id `a8bc9b67-6fa0-4e9a-a2d5-230be9042fd5`).
- **Fixed the disposition seed script:** `Trail_Codes.xlsx` has 70 data rows, but
  8 of them carry only remark text — they are extra remark-template variants of
  the `CB` (Call Back) code in the row above. The script previously skipped them
  (seeding 62); it now forward-fills the parent's action/result/description so
  **all 70 rows are preserved**, giving 9 selectable CB variants.

### How to view
- API health: http://localhost:4000/api/health → `{"status":"ok","db_connected":true}`
- Tables & seeded data: Adminer at http://localhost:8080 (credentials in README) —
  check `agencies` (1 row) and `disposition_codes` (70 rows).

---

## 2026-07-05 — Task 1.1: Backend TypeScript conversion & project hygiene

**Goal:** put the backend on solid footing before building features on it.

### Changes
- **Converted the backend to TypeScript** (strict mode). All `.js` sources replaced
  by `.ts`; dev server now runs via `tsx watch`, production build via `tsc`
  (`npm run build` → `dist/`).
- **App/server split:** `src/app.ts` builds the Express app (testable without
  binding a port); `src/server.ts` boots it.
- **Validated configuration:** `src/config/env.ts` parses all environment
  variables through a zod schema — the app fails fast at startup if anything
  required (e.g. `DATABASE_URL`, `JWT_SECRET`) is missing.
- **Structured logging:** pino (`src/config/logger.ts`) + pino-http request logs
  (health checks excluded to keep logs readable).
- **Central error handling:** `src/middleware/error-handler.ts` — consistent JSON
  errors, zod validation errors → 400, `HttpError` class for handlers, JSON 404.
- **Versioned migrations:** `node-pg-migrate` adopted. The original
  `src/migrations/001_init.sql` is frozen; its schema now lives as the idempotent
  baseline migration `migrations/1783216000000_baseline-init.sql`. All future
  schema changes: `npm run migrate:create <name>` → `npm run migrate:up`.
- **Lint/format:** ESLint (typescript-eslint, flat config) + Prettier.
- **Tests:** vitest + supertest (`test/health.test.ts`) — health endpoint and
  JSON 404 covered; `npm test` (needs the DB container running).
- Seed & purge scripts ported to TS: `npm run seed:dispositions -- <agency_id>`,
  `npm run purge:pings`.

### How to view
- `cd backend && npm run typecheck && npm run lint && npm test` — all green.
- http://localhost:4000/api/health → `{"status":"ok","db_connected":true}`
- http://localhost:4000/api/anything-else → `{"error":"Not found"}` (JSON, from
  the new error pipeline).
- `npm run migrate:up` → "No migrations to run" (baseline already recorded in the
  `pgmigrations` table).

---

## 2026-07-05 — Task 1.2: Auth — login, sessions, lockout, OTP reset, permissions

**Goal:** brief §10 auth requirements + §3 configurable permission model.

### Changes
- **Migration `1783300000000_auth-tables.sql`:** `refresh_tokens` (hashed,
  rotated), `otp_requests` (hashed, attempt-capped), lockout columns on `users`
  (`is_active`, `failed_login_attempts`, `locked_until`), and the
  **`permissions` + `capability_permissions`** tables seeded with the initial
  matrix — Agency Admin gets everything; Operations Manager gets everything
  *except* `ops_managers.create` and `billing.view` (brief §3, confirmed rule).
  Role tweaks are now data edits, not code changes.
- **`POST /api/auth/login`** — phone + password (bcrypt), generic 401 for bad
  credentials, **423 + lockout** after 5 failures (15 min, both configurable via
  env). **Device binding:** a login with a `device_id` becomes the single active
  device and revokes other devices' refresh tokens (brief §10).
- **`POST /api/auth/refresh`** — single-use rotating refresh tokens (30-day TTL);
  superseded-device tokens rejected.
- **`POST /api/auth/logout`**, **`GET /api/auth/me`**.
- **OTP password reset** — `POST /api/auth/otp/request` + `/otp/verify`:
  6-digit OTP, 10-min expiry, 5 verify attempts, all sessions revoked on reset.
  Sent through the `SmsProvider` interface; the dev `ConsoleSmsProvider` logs it
  and non-production responses include `devOtp` for testing. Swapping in
  MSG91/Twilio later touches one file.
- **Middleware:** `authenticate` (JWT verify + fresh user load, so deactivation
  is immediate) and `requirePermission(key)` (checks `capability_permissions`).
- **Bootstrap:** `npm run seed:admin -- <agency_id> <phone> <password> [name]`
  creates/resets the single Agency Admin. Dev admin seeded (phone `9999999999`).
- Tests: `test/auth.test.ts` — 9 integration tests covering success, generic
  401s, lockout, device supersession, token rotation, /me, and the full OTP
  reset flow. **11/11 tests green.**

### How to view
- Log in: `POST http://localhost:4000/api/auth/login` with
  `{"phone":"9999999999","password":"<dev password>"}` → tokens + capabilities.
- `GET /api/auth/me` with `Authorization: Bearer <access_token>`.
- `POST /api/auth/otp/request` with the same phone → response includes `devOtp`
  (dev only) and the "SMS" appears in the server log.
- Permission matrix: Adminer → `permissions`, `capability_permissions`.
