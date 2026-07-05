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

---

## 2026-07-05 — Task 1.3: Org & employee management API

**Goal:** brief §2/§3 — branches, teams, companies, and employee management with
the capability rules enforced.

### Changes
- **`/api/branches`, `/api/teams`, `/api/companies`** — list (any authenticated
  agency user, needed for pickers) + create/rename behind `*.manage` permissions.
  Teams validate their branch belongs to the caller's agency; everything is
  agency-scoped in every query.
- **`/api/employees`** — list (filter by branch / search by name or phone),
  create, view, update, and `POST /:id/reset-password`. Enforced rules:
  - `is_agency_admin` is **not accepted by the API at all** — exactly one per
    agency, bootstrap script only (brief §3).
  - Granting/revoking **Operations Manager requires `ops_managers.create`**,
    which only the Agency Admin capability holds — checked on create *and* edit.
  - Team Leader / Telecaller / Field Agent are freely toggleable designations.
  - Team must belong to the selected branch; branch/team must be in the agency.
  - **Deactivation** (needs `employees.deactivate`) revokes all refresh tokens —
    the employee's next API call fails immediately, not at token expiry.
  - Duplicate phone → clean 409 (new unique-violation handling in the error
    middleware).
- `GET /api/auth/me` now also returns the caller's **permission list** (drives
  the web portal menu).

### How to view
- `cd backend && npm test` — 20/20 green; `test/org.test.ts` covers the
  Ops-Manager-cannot-create-Ops-Manager rule, designation toggling, immediate
  deactivation, and agency scoping.
- With an admin token: `POST /api/branches {"name":"Sangli"}`,
  `POST /api/employees {...capabilities:{is_operations_manager:true}}`, then log
  in as that Ops Manager and try the same → 403.

---

## 2026-07-05 — Task 1.4: Web portal scaffold + Phase-1 screens

**Goal:** the admin/Ops-Manager web portal (React + Vite + TS + Ant Design) with
login and the org/employee screens.

### Changes
- **`frontend/` is now a real app:** Vite + React 18 + TypeScript (strict) +
  Ant Design 5. `npm run dev` → http://localhost:5173, `npm run build` compiles
  clean.
- **API client** (`src/api/client.ts`): axios with the access token attached
  automatically; on a 401 it silently redeems the refresh token once (rotation
  handled) and retries; a dead session lands back on /login.
- **Auth context** (`src/auth/AuthContext.tsx`): user + permission list from
  `/auth/me`; `hasPermission()` drives what the UI shows.
- **Screens:**
  - **Login** and **Forgot password** (2-step OTP; shows the dev OTP inline
    when the backend returns it).
  - **Layout** with capability-driven menu (brief §3: UI assembled from active
    capabilities) and the user's capability tags in the header.
  - **Dashboard** — entity counts placeholder until Phase 3–5 dashboards.
  - **Branches / Teams / Companies** — list + create/rename (teams pick a branch).
  - **Employees** — search, list with capability tags + status, create/edit with
    branch/team pickers (team list follows the chosen branch), capability
    checkboxes with the **Operations Manager checkbox disabled** unless the
    caller holds `ops_managers.create` (server enforces it regardless),
    deactivate switch, reset-password action.
- Seeded the brief's real org data via the live API as verification: branches
  Sangli, Pune, Kolhapur, Latur, Solapur; companies Hero FinCorp, Bajaj Finance,
  TVS Credit, HDB Financial, Tata Capital (all 201s).

### How to view
1. `docker compose up -d` (if not running), `cd backend && npm run dev`
2. `cd frontend && npm run dev` → open **http://localhost:5173**
3. Log in with the dev admin (phone `9999999999`). You should see the dashboard
   with 5 branches / 5 companies, and all menu items (admin has every permission).
4. Add an employee with the Operations Manager capability, log out, log in as
   them: the menu is identical *except* their Employees screen shows the
   Ops-Manager checkbox disabled — and the API refuses it server-side too.
5. Try the "Forgot password" flow: the OTP appears in an info box (dev mode).

---

## 2026-07-05 — Design brief adopted; portal re-themed

- `docs/design-brief.md` added (source of truth; may be updated later).
- Web portal now uses the design tokens via `frontend/src/theme.ts`: Deep Trust
  Teal `#00535b` primary, Field Recovery Green success, amber/crimson statuses,
  Inter font, **global tabular-nums** for financial values, 4/8/12px radius
  scale, 48px large controls, `#1A2332` sidebar.

---

## 2026-07-05 — Tasks 2.1 + 2.2: Excel import engine; products & buckets

**Goal:** brief §4 — per-company import templates, validated ingestion with zero
data loss, and products/buckets derived from the data itself.

### Changes (backend)
- **Migration `1783400000000_import-engine.sql`:** template versioning columns,
  `import_runs` audit table, `products` table, and a **unique index on
  `(company_id, loan_number)`** backing duplicate rejection.
- **Storage abstraction** (`src/services/storage/storage-provider.ts`):
  `LocalDiskStorage` under `UPLOAD_DIR` (default `backend/uploads/`), S3-ready
  interface (confirmed decision). Used for uploaded import files now, payment
  proofs later.
- **Import pipeline** (`exceljs` — not the vulnerable `xlsx` package — + multer):
  1. `POST /api/imports/upload` (.xlsx, ≤15 MB) → detected columns + row count +
     an `upload_key`.
  2. `POST /api/import-templates` — save mapping {Excel column → system field}.
     **Re-saving a name creates version N+1 and deactivates the old version.**
  3. `POST /api/imports/preview` — dry run: required-field misses, non-numeric
     amounts, in-file duplicate loan numbers, already-in-DB duplicates, unmapped
     columns, sample rows. Writes nothing.
  4. `POST /api/imports/commit` — transactional insert; unmapped columns go to
     `customers.custom_fields` JSONB (no data loss); Indian-format amounts like
     "1,25,000" parsed; products derived; `import_runs` audit row written.
  5. `GET /api/imports/runs?company_id=` — import history.
- **Products & buckets** (`src/routes/catalog.ts`):
  - `GET /api/products?company_id=` — raw label + canonical label + customer count.
  - `POST /api/products/normalize` — e.g. HL + Home Loan → "Home Loan", no re-import.
  - `GET /api/buckets?company_id=` — distinct values straight from the data.
- All endpoints behind the `imports.manage` permission (admin + ops manager).
- **12 new integration tests** (31 total, all green) driving the whole pipeline
  with a synthetic messy ledger: 2 product spellings, a missing loan number, an
  in-file duplicate, a malformed amount, an unmapped "Vehicle No" column, and a
  full re-import (all rows flagged as DB duplicates, zero inserted).

### How to view
- `cd backend && npm test`
- The UI for this arrives next (Tasks 2.3 + 2.4: disposition master admin +
  import wizard screens). Until then the flow is exercisable via curl/tests.
