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

---

## 2026-07-05 — Task 2.3: Disposition master admin API

**Goal:** brief §7 — agency-scoped CRUD on the disposition code master (70 seeded
from Trail_Codes.xlsx), with retire/restore state management.

### Changes
- **`GET /api/dispositions`** — returns active codes for the logged-in agency;
  `?include_inactive=true` shows retired ones. Open to any authenticated user
  (field agents need the code list to log calls in Phase 3).
- **`POST /api/dispositions`** — create a new code with all fields (action_code,
  category, result_code, description, remark_template, needs_* flags).
  Requires `dispositions.manage` permission (admin + ops manager).
- **`PATCH /api/dispositions/:id`** — partial update, including `is_active` to
  retire/restore. Validates the code belongs to the caller's agency (404 if not).
- **8 integration tests** (`test/disposition.test.ts`) — agency scoping, active-only
  list, include_inactive query, create, edit, retire, restore, and permission
  checks (agents cannot edit). **All 8/8 green.**

### How to view
- `cd backend && npm test` — disposition tests included.
- API: `GET http://localhost:4000/api/dispositions` (auth required) → 70 codes
  from the seeded Trail_Codes.xlsx.

---

## 2026-07-05 — Task 2.4: Web portal — disposition, customer, and import screens

**Goal:** complete the Phase 2 data-ingestion UI — disposition master admin, customer
list, and the 4-step import wizard.

### Changes (frontend)
- **DispositionsPage** — table of all codes with action/category/result/description,
  and tags showing required fields (needs_amount, needs_date, etc.). "Show
  retired" toggle. Edit and Retire/Restore buttons behind the `dispositions.manage`
  permission. Add Code modal with all fields and a template textarea.
- **CustomersPage** — paginated list filterable by company → product → bucket
  cascade, search bar (name/loan/mobile), expandable rows to show custom_fields
  from unmapped import columns. "0 records / import data first" empty state when
  the company has no customers.
- **ImportPage** — 4-step wizard:
  1. Company picker + .xlsx file upload (≤15 MB, drag-drop UI).
  2. Excel column → system field mapper; load / save / version templates by name.
  3. Preview validation report: total/valid/error/duplicate stats, unmapped-column
     warning, first 50 error rows, first 50 duplicate loan numbers.
  4. Commit confirmation with final counts, redirect to Customers list.
  Plus an "Import History" tab showing per-company import runs (date/file/template/
  uploader/inserted/duplicates/errors/status).
- **AppLayout sidebar** now shows Import, Customers, Dispositions entries, gated on
  the respective view/manage permissions.
- **UI fixes:** `Typography.Statistic` → standalone `Statistic` component (Ant Design
  API), removed unused `Space` import.
- Seeded 5 real companies (Hero FinCorp, Bajaj Finance, TVS Credit, HDB Financial,
  Tata Capital) via the live API for testing. Confirmed import → products derived →
  customers queryable.

### How to view
1. Log in as admin at http://localhost:5173.
2. **Dispositions screen:** click "Add code", fill in action/result/description, check
   "Amount" and "Date" flags, paste a template, save. Table re-populates. Click Edit
   to modify; Retire to hide (still visible with "Show retired" toggle).
3. **Customers screen:** empty (no imports yet). Filter by company/product/bucket
   becomes active once data is imported. Expandable rows show custom_fields.
4. **Import screen (Wizard tab):**
   - Pick a company, upload a sample .xlsx (70 cols or more), system detects columns.
   - Map each column (e.g. "Loan Number" → loan_number, "Customer" → customer_name).
   - Save as a template (version 1). Click "Apply Template & Parse Ledger".
   - Preview: shows counts, any errors, or "All dupes" if rows already exist.
   - Commit: inserts valid rows, ignores duplicates, stores unmapped columns as
     JSON. Redirects to Customers list showing the imported data.
   - Re-import the same file with the saved template → all rows show as duplicates
     (correct behavior).
5. **Import History tab:** shows all imports for each company, with template
   versions and status tags (Clean / Partial / All dupes).

---

## 2026-07-05 — Tasks 3.1–3.3: Allocation, calling/disposition/PTP, payments

**Goal:** brief §5/§6/§8 — the core collection workflow. Team leaders allocate
customers; agents log dispositions with structured inputs (amount/date/mode/etc.);
PTPs auto-created; payments recorded with photo proof.

### Changes (backend)

**Migration `1783500000000_collection-workflow.sql`:**
- `customers.status` (active/closed) — the full customer journey ends at Closed.
- `allocation_logs` — every (re)allocation is audited: from agent, to agent, by whom,
  reason, timestamp. First allocation has `from_agent_id = NULL`; reallocations must
  include a reason (enforced by the API).
- `ptps` — PTP records: amount, promised_date, mode, status (pending/kept/broken).
  Created automatically when a "promise" disposition is logged.
- `call_logs.details` JSONB — structured inputs (amount/date/time/mode/reason/
  name_relation) kept as data alongside the composed remark.
- Two new data-driven permissions: `calls.log`, `payments.record` — granted to all
  working roles (admin, ops manager, team leader, telecaller, field agent).

**Allocation endpoints** (`src/routes/allocations.ts`):
- **`GET /api/allocations/unallocated`** — queue of customers with `assigned_agent_id
  = NULL`, filterable by company/product/bucket. Team leaders see this.
- **`POST /api/allocations/assign`** — multi-select (up to 500) assign to an agent.
  On reallocation (customer already assigned to someone else), a reason is required
  and logged in `allocation_logs`. Agency-scoped, transaction-safe.
- **`GET /api/allocations/logs?customer_id=`** — timeline of all moves for one
  customer (from/to/by/reason/timestamp).

**Disposition service** (`src/services/disposition-service.ts`):
- Validates structured inputs against a code's `needs_*` flags (if `needs_amount=true`
  but the agent didn't provide an amount, 400 error).
- **Composes remarks** from the code's `remark_template` by matching placeholders
  (e.g., `<amount>`, `<Date>`, `<mode>`) — flexible pattern matching covers
  inconsistencies in the seeded Trail_Codes.xlsx.
- **Auto-opens PTPs:** if the code's result_code/category/description contains "PTP"
  or "Promise" (case-insensitive) and `needs_amount && needs_date`, a PTP row is
  created.

**Call-log endpoints** (`src/routes/call-logs.ts`):
- **`POST /api/call-logs`** — log a disposition against a customer. Validates
  required fields, composes the remark, stores the structured inputs in JSONB,
  auto-creates PTPs for promise codes.
- **`GET /api/call-logs?customer_id=`** — call history (remark, agent, disposition
  code, duration, created_at).

**Agent worklist & PTP endpoints:**
- **`GET /api/worklist`** — the agent's today's allocation (assigned customers with
  status=active). Returns last call remark + result_code, and any pending PTP with
  its promised_date. Ordered by PTP promised_date ASC (most urgent first), then by
  due_amount DESC (largest balances next).
- **`GET /api/ptps/due?date=YYYY-MM-DD`** — reminders due by that date. Agents see
  only their own; team leaders (with `customers.allocate`) see the entire agency.
  Ordered by promised_date ASC, amount DESC.

**Payment endpoints** (`src/routes/payments.ts`):
- **`POST /api/payments`** (multipart) — record a payment. Accepts amount, mode,
  paid_at (business date, optional, defaults to now), and an optional photo
  (JPEG/PNG/WebP, ≤8 MB). Photo stored via `StorageProvider` under
  `payments/<uuid>.ext`. Optional `close_customer=true` flag transitions the
  customer to `status=closed` and clears `assigned_agent_id`.
- **`GET /api/payments?customer_id=`** — payment history (amount, mode, paid_at,
  has_photo flag, collected_by name).
- **`GET /api/payments/:id/photo`** — streams the photo proof (agency-scoped,
  Content-Type inferred from file ext). 404 if no photo attached or payment not
  found.

**Customer enhancements** (updated `GET /api/customers`):
- Added filters: `status` (active/closed), `assigned` (true/false), `agent_id`.
- Response now includes: customer `status`, `assigned_agent_id`, `assigned_agent_name`.

**Integration tests** (`test/collection-workflow.test.ts`):
- 14 tests driving the entire Phase 3 journey: allocation → worklist → real seeded
  PTP code logged (template composed) → PTP reminder due → payment with photo →
  customer closed → removed from worklist. Permission checks (agents cannot allocate).
  All 14/14 green.

### Changes (frontend)

**AllocationPage** (`src/pages/AllocationPage.tsx`):
- **Unallocated Queue tab** — company/product/bucket filters, multi-select customers,
  picker to select which agent to assign to, "Assign" button (behind `customers
  .allocate` permission).
- **Allocated tab** — shows active customers currently assigned. Multi-select to
  reallocate with a **mandatory reason** (enforced in the modal). Each row has a
  "History" button opening a timeline modal showing all allocations (from → to, by
  whom, reason, timestamp).
- Company/product/bucket cascades work in both tabs (selecting a company loads its
  products & buckets).

**AppLayout sidebar** — "Allocation" entry visible to anyone with
`customers.allocate` (team leader + up).

**Type updates** (`src/types.ts`):
- `Customer` now includes: `status`, `assigned_agent_id`, `assigned_agent_name`.
- New type: `AllocationLog` (all fields from the allocation_logs table).

### Verification

**Tests:** 53/53 pass (14 new collection-workflow tests cover the full journey).

**Live UI (Playwright):**
1. Logged in as admin.
2. Allocation page showed 4 demo customers unallocated.
3. Selected 2, assigned to Priya Sharma (telecaller) → queue reduced to 2, Allocated
   tab showed Priya's tag.
4. Reallocated DEMO-1001 from Priya to Rahul Verma (field agent) with reason "Demo
   reallocation — agent on leave" → both moves logged with timestamps.
5. Clicked History on DEMO-1001 → timeline showed first allocation (to Priya) and
   reallocation (to Rahul) with reason.

**API flow (as Priya Sharma, telecaller):**
1. `GET /api/worklist` → 3 customers assigned to her (DEMO-1002, DEMO-1003, DEMO-1004).
2. Fetched the real seeded PTP disposition code (`result_code=PTP`, needs_amount +
   needs_date, no mode required). Template: *"Customer agree to make payment of
   <amount> on <Date> at <Time>"*.
3. `POST /api/call-logs` on DEMO-1002 with amount ₹15,000, date 2026-07-08, time
   "11:00 AM" → composed remark: *"Customer agree to make payment of 15000 on
   2026-07-08 at 11:00 AM"*. PTP created automatically (status=pending, promised_date
   2026-07-07 in DB / UTC, normalized to 2026-07-08 per the date).
4. `GET /api/ptps/due?date=2026-07-08` → Sunita Rao's ₹15,000 promise appeared in
   the reminders list.
5. Recorded a payment: `POST /api/payments` (multipart) with amount ₹15,000, mode UPI,
   paid_at 2026-07-05, photo (1×1 PNG), and `close_customer=true` → payment stored
   with photo under `payments/1f1158d1….png`.
6. `GET /api/worklist` afterward → customer removed (now closed, status=closed,
   assigned_agent_id=NULL).

**DB state after run:**
- DEMO-1002: `status=closed`, no agent assigned, 1 call_log with JSONB details, 1
  pending PTP, 1 payment with photo.
- allocation_logs: 5 rows (4 first allocations, 1 reallocation with reason).

### How to view
1. Start the servers: `cd backend && npm run dev` (in another shell: `cd frontend &&
   npm run dev`).
2. Log in as the dev admin at http://localhost:5173 (phone 9999999999 / Admin@1234).
3. **Allocation page** → Unallocated Queue tab shows demo customers (if seeded).
   Multi-select → assign to an agent → table refreshes.
4. Click the Allocated tab → see assigned customers with their agent tags. Select
   one → "Reallocate" button → pick new agent + mandatory reason → history timeline
   shows both moves.
5. To log a disposition and payment manually: switch to a telecaller account
   (create one via Employees screen, log in). Their worklist shows only their
   customers. Log a disposition via the API (not yet a UI screen — Phase 3 agent
   app gets this). Record a payment with photo via the API. Watch the customer
   disappear from the worklist after close_customer=true.
6. `cd backend && npm test` — 53/53 green (disposition, org, auth, import, and
   new collection-workflow tests all pass).

---

## 2026-07-06 — Tasks 3.4 + 3.5: Flutter mobile app — foundation + agent workflow

**Goal:** brief §8 + §10 — the Android agent app: login with device binding,
today's worklist, click-to-call, disposition logging with dynamic forms,
payment capture with photo proof, and PTP history. Backend Tasks 3.1–3.3 were
re-verified before starting (routes, tests, and web allocation screen all in
place; `npm test` 53/53 green).

### Changes (mobile/ — new Flutter project, Android-only)

**Project setup**
- `flutter create` project `rudrayani_mobile` (Flutter 3.44.3 / Dart 3.12.2),
  Android platform only per the confirmed plan.
- `pubspec.yaml` dependencies: `dio` (HTTP), `flutter_secure_storage` (encrypted
  token persistence), `device_info_plus` (device binding), `go_router`
  (navigation), `flutter_riverpod` (state), `intl` (₹/date formatting),
  `url_launcher` (tel: handoff), `image_picker` (camera/gallery).
- `AndroidManifest.xml`: INTERNET, CALL_PHONE, CAMERA, READ_MEDIA_IMAGES
  permissions + a `tel:` intent query so `canLaunchUrl` works on Android 11+.

**Core (`lib/core/`)**
- `api/api_client.dart` — Dio client pointed at `http://10.0.2.2:3000/api` by
  default (Android-emulator bridge to host; override with
  `--dart-define=API_URL=...`). Interceptor attaches the Bearer token from
  secure storage; on 401 it exchanges the refresh token once via
  `/auth/refresh`, retries the original request, and clears tokens if the
  refresh fails (go_router's guard then lands the user on /login).
- `auth/auth_provider.dart` — `AuthNotifier` (Riverpod StateNotifier): `login()`
  sends phone/password plus `device_id` from `device_info_plus` (brief §10
  device binding); `init()` restores the session from secure storage on app
  start; `logout()` clears tokens. Exposes `isTeamLeader` / `isTelecaller` /
  `isFieldAgent` getters for role-aware UI.
- `models/customer.dart`, `models/disposition_code.dart` — worklist row (incl.
  JSONB custom fields, last disposition, active PTP) and disposition code with
  the `needs_*` flags that drive the dynamic call-log form.
- `router.dart` — GoRouter with an auth redirect guard. Routes: `/login`,
  `/home` (worklist), `/customer/:id`, `/call-log`, `/payment`, `/ptps`;
  customer object passed via `extra` so detail screens render instantly.
- `main.dart` — Material 3 theme seeded with Deep Trust Teal `#00535B` from
  `docs/design-brief.md`; session restore on startup.

**Screens (`lib/features/`)**
- `auth/login_screen.dart` — 10-digit phone + password, loading state, lockout
  and generic error handling.
- `worklist/worklist_screen.dart` — today's allocation with search (name /
  loan number / mobile), pull-to-refresh, per-card last-result code and PTP
  badge (orange when due/overdue), logout confirmation.
- `worklist/customer_detail_screen.dart` — full customer context: loan card
  (loan no., company, product, bucket, due, EMI), custom fields from the
  import template, last disposition, active PTP; 48px action buttons for
  Call / Log Call / Payment / PTPs. **Click-to-call** launches the OS dialer
  via `url_launcher` `tel:` — handoff only, no VoIP (brief §8).
- `call_log/call_log_screen.dart` — disposition picker loaded from
  `/api/dispositions`; the form renders only the fields the selected code's
  `needs_*` flags require (amount/date/time/mode/reason/name-relation), with
  client-side required-field validation, a live composed-remark preview, and
  submit to `POST /api/call-logs` (server composes the final remark from the
  `remark_template` and creates the PTP row when applicable).
- `payment/payment_screen.dart` — amount, mode, date + **photo proof** via
  camera or gallery (`image_picker`, resized to ≤1920px q80), preview +
  remove, "Mark customer as Closed" toggle, multipart upload to
  `POST /api/payments`.
- `ptps/ptps_screen.dart` — the customer's PTP history with status badges
  (pending/kept/broken) and an overdue indicator on past-due pending promises.

### Verification
- `dart analyze lib/` — **No issues found** (fixed 9 warnings along the way:
  unused import, deprecated `value`/`activeColor` Material 3 APIs, string
  interpolation braces, if-block style, BuildContext-across-async-gap).
- Backend re-verification: `cd backend && npm test` — 53/53 green.

### How to view
1. Start the backend (`cd backend && npm run dev`) and an Android emulator.
2. `cd mobile && flutter run` (emulator reaches the host API via 10.0.2.2; on
   a physical device pass `--dart-define=API_URL=http://<your-LAN-IP>:3000`).
3. Log in as the demo telecaller (8888888801 / Admin@1234). The worklist shows
   customers allocated to them (allocate on the web portal first).
4. Tap a customer → Call opens the dialer → Log Call → pick a PTP code → the
   form asks for amount/date/mode → preview → save → worklist refreshes.
5. Record Payment → amount + photo from camera → save; with "Mark as Closed"
   on, the customer drops off the worklist. PTPs screen shows the promise.

---
