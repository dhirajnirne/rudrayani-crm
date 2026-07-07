# Rudrayani Fintech CRM - Comprehensive Testing Guide

**Last Updated:** 2026-07-07  
**Version:** Phase 7 (Allocation Lifecycle, Discrepancy Review, Customer 360 & Granular Reporting)

---

## Table of Contents

1. [Environment Setup](#environment-setup)
2. [Testing Strategy](#testing-strategy)
3. [Backend Testing](#backend-testing)
4. [Frontend (Web) Testing](#frontend-web-testing)
5. [Mobile (Flutter) Testing](#mobile-flutter-testing)
6. [End-to-End Testing](#end-to-end-testing)
7. [Edge Cases & Error Scenarios](#edge-cases--error-scenarios)
8. [Performance & Load Testing](#performance--load-testing)
9. [Security Testing](#security-testing)

---

## Environment Setup

### Prerequisites

- **Docker** (for PostgreSQL, Redis)
- **Node.js** 18+ with npm/yarn
- **Python** 3.9+ (for graphify and data analysis)
- **Flutter SDK** 3.0+ (for mobile testing)
- **Postman** or **curl** (for API testing)
- **Git** for version control

### Local Development Setup

```bash
# Clone and setup
git clone <repo-url>
cd Rudrayani_Fintech_2

# Backend
cd backend
npm install
npm run migrate:up
npm run seed:demo

# Frontend
cd ../frontend
npm install

# Mobile
cd ../mobile
flutter pub get

# Start services
# Terminal 1: Docker
docker compose up -d

# Terminal 2: Backend
cd backend && npm run dev

# Terminal 3: Frontend
cd frontend && npm run dev

# Terminal 4: Mobile (Emulator)
cd mobile && flutter run -d emulator-5554
```

### Test Database Isolation

Each test suite creates and destroys its own test data to ensure isolation:
- Test data cleanup happens in `afterAll()` hooks
- Use `npm run test:isolated` to run tests with separate transaction contexts
- Never run integration tests against production database

---

## Testing Strategy

### Test Pyramid

```
              /\
             /  \  E2E Tests (5%)
            /____\
           /      \
          /  API   \ Integration Tests (25%)
         /  Tests  \
        /___________\
       /             \
      / Unit Tests    \ Unit Tests (70%)
     /_______________\
```

### Test Execution Order

1. **Unit Tests** (fastest, isolated): 5-10 minutes
2. **Integration Tests** (database queries): 10-15 minutes
3. **API Tests** (HTTP endpoints): 15-20 minutes
4. **UI Tests** (frontend/mobile): 20-30 minutes
5. **E2E Tests** (full workflows): 30-45 minutes

### Coverage Goals

- **Backend**: ≥85% (currently 198/198 tests passing)
- **Frontend**: ≥70% (critical paths)
- **Mobile**: ≥60% (essential flows)

---

## Backend Testing

### Running Backend Tests

```bash
cd backend

# All tests
npm test

# Specific test file
npm test -- allocation-import.test.ts

# With coverage
npm test -- --coverage

# Watch mode (auto-rerun on file change)
npm test -- --watch

# Specific test by name pattern
npm test -- -t "allocation-confirmed movement"
```

### Test Files Structure

```
backend/test/
├── allocation-import.test.ts      # Diff engine, additions/removals
├── import-review.test.ts          # Review queue CRUD, approvals
├── bucket-mismatches.test.ts      # DPD cross-check report
├── bucket-movements.test.ts       # Payment-driven events
├── e2e-allocation-lifecycle.test.ts # Multi-company 3-month cycle
├── reports.test.ts                # Dashboard metrics, exports
├── auth.test.ts                   # Login, OTP, device binding
├── field-workflow.test.ts         # Call logs, disposition codes
├── collection-workflow.test.ts    # PTPs, payments
└── ... (19 test files total)
```

### Key Backend Test Scenarios

#### 1. Authentication & Authorization

**Test:** `auth.test.ts`

```
✓ Login with valid credentials returns JWT
✓ Login with invalid password locks account after 3 attempts
✓ Account lockout persists across sessions
✓ OTP reset flow generates code, validates reset
✓ Device binding: new device supersedes old sessions
✓ JWT refresh extends session without re-authenticating
✓ Permissions are role-based (agency_admin vs telecaller)
✓ Scope clamping: agent cannot view other agent's customers
```

**Running:**
```bash
npm test -- auth.test.ts
# Expected: 9 tests pass, ~45s
```

#### 2. Allocation Import Lifecycle

**Test:** `allocation-import.test.ts`

```
✓ First-of-month: additions insert directly, removals go to review
✓ Mid-month (repeat): all changes (adds/removes/reactivations) go to review
✓ Loan number normalization: trim + uppercase for comparison
✓ Products & buckets are derived and stored on import_runs
✓ New mode (unrelated to allocation) is unaffected
✓ Snapshot writes happen on commit
✓ Preview endpoint returns accurate diff counts
```

**Running:**
```bash
npm test -- allocation-import.test.ts
# Expected: 13 tests pass
```

**Manual Verification:**
```bash
# 1. Upload file with 10 loans
curl -X POST http://localhost:4000/api/imports/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@hero-allocation.xlsx"
# Returns: { upload_key: "abc123", ... }

# 2. Preview to see the diff
curl -X POST http://localhost:4000/api/imports/preview \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "upload_key": "abc123",
    "company_id": "xxx",
    "column_mapping": {...},
    "mode": "allocation",
    "allocation_month": "2026-07-01"
  }'
# Returns: { additions: [...], removals: [...], will_update: 8, ... }

# 3. Commit the import
curl -X POST http://localhost:4000/api/imports/commit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{...same as preview...}'
# Returns: { import_run_id, inserted_rows, updated_rows, pending_review, ... }
```

#### 3. Import Review Queue

**Test:** `import-review.test.ts`

```
✓ Pending review items created on first-of-month removals
✓ Mid-month additions/removals routed to review (not inserted)
✓ Telecaller (403) cannot approve, ops_manager (200) can
✓ Approve addition: customer inserted with snapshot
✓ Approve removal: customer status → recalled, assignment cleared
✓ Approve reactivation: status → active, recalled_at → null
✓ Reject (any type): status stays pending, no data change
✓ Bulk decision: mixed statuses skipped, approves rest
✓ Supersede rule: new import marks all pending items superseded
✓ Double-decision returns 409 Conflict
```

**Running:**
```bash
npm test -- import-review.test.ts
# Expected: 13 tests pass
```

**Manual Verification:**
```bash
# 1. After mid-month import, list pending items
curl -X GET "http://localhost:4000/api/import-reviews?company_id=$CID&status=pending" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Returns: { items: [{ id, item_type, loan_number, payload, ... }], ... }

# 2. Approve an addition
curl -X POST "http://localhost:4000/api/import-reviews/$ITEM_ID/decision" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "action": "approve", "note": "Verified customer" }'
# Returns: 200 { status: "approved" }

# Verify: customer now exists in DB
SELECT id, loan_number, status FROM customers WHERE id = $CUSTOMER_ID;
# Returns: (uuid, "LOAN-123", "active")
```

#### 4. DPD Cross-Check (Bucket Mismatches)

**Test:** `bucket-mismatches.test.ts`

```
✓ Flags lender bucket disagreeing with due-date-implied bucket
✓ Does not flag customer whose bucket agrees
✓ Never flags customer with no due_date (undetectable)
✓ Never flags customer with unmapped bucket (canonical_bucket = null)
✓ Excludes recalled/closed customers (active book only)
✓ Future due date (not yet overdue) implies canonical 0
✓ Company scoping: mismatches from other companies excluded
✓ Report is live, as-of-today (not month-scoped)
```

**Running:**
```bash
npm test -- bucket-mismatches.test.ts
# Expected: 7 tests pass
```

**Manual Verification:**
```bash
# 1. Map canonical buckets first
curl -X PATCH "http://localhost:4000/api/buckets/$BUCKET_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "canonical_bucket": 1 }'
# Returns: 200 { id, label, canonical_bucket: 1, ... }

# 2. Get mismatches
curl -X GET "http://localhost:4000/api/reports/bucket-mismatches?company_id=$CID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Returns: {
#   rows: [
#     {
#       loan_number: "LOAN-X",
#       customer_name: "Name",
#       lender_bucket: "1",
#       lender_canonical: 1,
#       due_date: "2026-05-15",
#       dpd: 45,
#       computed_canonical: 1  # floor(45/30) = 1, agrees
#     },
#     {
#       loan_number: "LOAN-Y",
#       lender_bucket: "X",
#       lender_canonical: 0,
#       dpd: 75,
#       computed_canonical: 2  # floor(75/30) = 2, mismatch!
#     }
#   ]
# }

# 3. Verify on dashboard
# Open browser: http://localhost:5173/dashboard
# Card "Bucket Mismatches (DPD Cross-Check)" shows flagged loans
```

#### 5. Bucket Movements (Payment-Driven Events)

**Test:** `bucket-movements.test.ts`

```
✓ Payment covering bucket-1 arrears (1×EMI) triggers one event
✓ Second qualifying payment same month: no duplicate (partial unique index)
✓ Unmapped canonical bucket: no event generated
✓ EMI missing: falls back to due_amount
✓ Both EMI and due_amount missing: skipped, undetectable
✓ Allocation import writes confirmation event on bucket drop
✓ Event never modifies customers.bucket (lender file is authoritative)
```

**Running:**
```bash
npm test -- bucket-movements.test.ts
# Expected: 8 tests pass
```

**Manual Verification:**
```bash
# 1. Create bucket-1 customer
curl -X POST "http://localhost:4000/api/customers" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "company_id": "$CID",
    "loan_number": "TEST-001",
    "customer_name": "Test Customer",
    "bucket": "1",          # 30-59 DPD bucket
    "due_amount": 50000,
    "emi": 5000             # Threshold = 1 × 5000 = 5000
  }'

# 2. Record payment of 5000 (exactly covers 1×EMI)
curl -X POST "http://localhost:4000/api/payments" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "customer_id=$CUSTOMER_ID" \
  -F "amount=5000"

# 3. Verify movement event created
SELECT * FROM bucket_movements 
WHERE customer_id = $CUSTOMER_ID AND trigger = 'payment';
# Returns: 1 row with (customer_id, from_bucket: "1", to_canonical: 0, ...)

# 4. Record another payment same month
curl -X POST "http://localhost:4000/api/payments" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "customer_id=$CUSTOMER_ID" \
  -F "amount=2000"

# 5. Verify no duplicate
SELECT COUNT(*) FROM bucket_movements 
WHERE customer_id = $CUSTOMER_ID AND trigger = 'payment' 
  AND EXTRACT(MONTH FROM detected_at) = EXTRACT(MONTH FROM now());
# Returns: 1 (no duplicate thanks to unique index)
```

#### 6. Recalled Customer Report

**Test:** `reports.test.ts` (recall report section)

```
✓ Counts recalled cases for the month (recalled_at within month)
✓ Lifetime recalled count (month-independent)
✓ By-company summary with recalled_count
✓ Detailed customer list: loan_number, name, company, recalled_at, last_bucket, last_agent
✓ Last agent resolved from allocation_logs (assignment cleared at recall)
✓ Filtering by company_id doesn't cause 500 error
✓ Dashboard status filter can narrow to recalled customers
✓ Export workbook includes "Recalled Customers" sheet
```

**Running:**
```bash
npm test -- -t "recall report"
# Expected: 8 tests pass
```

#### 7. Multi-Company E2E Test

**Test:** `e2e-allocation-lifecycle.test.ts` (comprehensive)

```
Scenario: Two companies, three months each, multiple currencies

Alpha Finance NBFC (Hero-style columns):
✓ Month 1: 8 loans insert directly
✓ Month 2: 1 removal + 1 addition flagged for review
✓ Month 2: Approve both, removal is recalled, addition is active
✓ Month 3: Reappearing loan (reactivation from recalled)
✓ Canonical bucket mapping: X=0, 1=1, 2=2, NPA=3
✓ DPD cross-check: flags ALPHA-008 (lender="X" but due_date implies 2)
✓ Next month: Bucket drops trigger allocation-confirmed events
✓ Payment creates movement event, visible on worklist badge

Beta Credit Corp (Indifi-style columns):
✓ Same three-month cycle with different column layout
✓ Removal stays recalled (no reactivation in month 3)
✓ DPD cross-check: flags BETA-106 with different mismatch
✓ Recalled customer report lists BETA-103 with resolved agent

Cross-System:
✓ Recalled counts exclude from active worklist
✓ Dimension breakdown (by product) reconciles with dashboard
✓ Status filter works on all endpoints
✓ Role-based scope clamping (TL can't widen beyond their team)
```

**Running:**
```bash
npm test -- e2e-allocation-lifecycle.test.ts
# Expected: 10 tests pass, ~30-45s
```

---

## Frontend (Web) Testing

### Running Frontend Tests

```bash
cd frontend

# Type checking
npm run typecheck

# Build (production)
npm run build

# Dev server for manual testing
npm run dev
# Opens http://localhost:5173

# Unit tests (when available)
npm test
```

### Manual Testing Checklist

#### 1. Authentication Flow

**Test Scenario:** Admin login, OTP reset, device binding

```
Step 1: Open http://localhost:5173/login
  ✓ Email field visible and accepts rudrayanifintechs@gmail.com
  ✓ Password field visible and masked
  ✓ "Login" button is clickable
  ✓ Form validates: prevents empty submission

Step 2: Login with valid admin creds
  ✓ Dashboard loads
  ✓ Nav shows agency name and admin's full name
  ✓ Nav shows all menu items: Dashboard, Imports, Review, Allocations, etc.
  ✓ JWT stored in localStorage (check DevTools > Application > Cookies)

Step 3: Logout
  ✓ Redirect to /login
  ✓ All nav items hidden
  ✓ localStorage cleared

Step 4: OTP Reset
  ✓ Click "Forgot password?" on login
  ✓ Enter phone number, request OTP
  ✓ (Dev env) OTP printed to console
  ✓ Enter OTP and new password
  ✓ Redirect to login
  ✓ Login with new password succeeds
```

**Edge Cases:**
- Invalid email format → error message
- Account locked after 3 failed attempts → error message with countdown
- OTP expired (>5 min) → request new OTP
- Device binding: login from new device → old device session revoked

#### 2. Import Workflow (Complete Cycle)

**Test Scenario:** First-of-month + mid-month refresh

**File:** `backend/test/fixtures/alpha-finance-month1.xlsx`

```
Step 1: Navigate to Imports page
  ✓ "Upload File" section visible
  ✓ File input accepts .xlsx files
  ✓ Drag-and-drop works

Step 2: Upload alpha-finance-month1.xlsx
  ✓ File uploaded, shows in preview
  ✓ Step 2 (Map Columns) appears
  ✓ Column mapping suggestions auto-fill (e.g., "customername" → "customer_name")
  ✓ Product column detected and listed
  ✓ Bucket column detected

Step 3: Map columns
  ✓ loan_agreement_no → loan_number
  ✓ customername → customer_name
  ✓ Bkt → bucket
  ✓ PROD → product
  ✓ pos → due_amount
  ✓ emi_amount → emi
  ✓ Select "Customer detail" checkboxes for a few columns (e.g., branch, state)
  ✓ Save as template "Hero Finance - Standard"

Step 4: Preview (Step 3)
  ✓ Shows: "8 rows will be inserted" (first-of-month)
  ✓ Shows: "0 pending review" (first import)
  ✓ Shows: "New buckets: [X, 1, 2, NPA]"
  ✓ Shows: "New products: [CVL, LPL, PBPLF]"
  ✓ Commit button enabled

Step 5: Commit
  ✓ Success message: "Import complete: 8 inserted, 0 updated"
  ✓ Redirect to dashboard
  ✓ Widget shows 8 active customers

Step 6: Upload alpha-finance-month2-refresh.xlsx (same month)
  ✓ Template auto-loads "Hero Finance - Standard"
  ✓ Preview shows:
    - "7 will be updated" (existing loans with updated amounts)
    - "1 addition pending review" (ALPHA-009)
    - "1 removal pending review" (ALPHA-004 missing from file)
  ✓ Commit

Step 7: Navigate to Import Review
  ✓ Table shows 2 pending items
  ✓ Item 1: type=Addition, loan_number=ALPHA-009, bucket=1, amount=28000
  ✓ Item 2: type=Removal, loan_number=ALPHA-004, bucket=2, amount=40000
  ✓ Click "Approve" on both
  ✓ Status updates to "approved" (or disappears from pending list)
  ✓ Verify in Allocations: ALPHA-004 is now "Recalled"
  ✓ Verify in Allocations: ALPHA-009 is now "Active"

Step 8: Upload alpha-finance-month3-refresh.xlsx
  ✓ Preview shows:
    - "8 will be updated"
    - "1 reactivation pending review" (ALPHA-004 reappearing)
  ✓ Approve reactivation
  ✓ Verify ALPHA-004 status → Active (not Recalled anymore)
```

**Edge Cases:**
- File format invalid (not .xlsx) → error message
- Column mapping incomplete → cannot proceed
- Same file uploaded twice → supersedes previous pending items
- Logout mid-import → session lost, must re-upload

#### 3. Bucket Configuration

**Test Scenario:** Map canonical buckets

```
Step 1: Navigate to Buckets admin page
  ✓ Table shows: [X, 1, 2, NPA] (auto-discovered from import)
  ✓ Columns: Label, Sort Order, Canonical Bucket, Is Current

Step 2: Click edit (pencil icon) on bucket "X"
  ✓ Modal opens
  ✓ Set Canonical Bucket = 0
  ✓ Click "Save"
  ✓ Feedback: "X mapped to canonical 0 (current month)"
  ✓ Table updated: X row shows canonical=0, is_current=true

Step 3: Map bucket "1"
  ✓ Set Canonical = 1
  ✓ Save

Step 4: Map bucket "2"
  ✓ Set Canonical = 2
  ✓ Save

Step 5: Leave bucket "3" unmapped (canonical = null)
  ✓ "Unmapped" warning tag visible

Step 6: Navigate to Dashboard > Bucket Mismatches card
  ✓ Card is visible
  ✓ Table shows loans with mismatches:
    - ALPHA-008: lender="X" (canonical 0), DPD=75 (canonical 2) → MISMATCH
    - Other loans with agreeing buckets: not in list
```

**Edge Cases:**
- Set canonical_bucket=0 but is_current=false → auto-corrects to is_current=true
- Try to unmap a bucket → canonical=null allowed, but movement detection skips
- Multiple buckets with is_current=true → error or auto-correction?

#### 4. Customer Detail Drawer

**Test Scenario:** View full 360° customer view

```
Step 1: Navigate to Allocations page (list all customers)
  ✓ Table shows: Loan Number, Customer, Bucket, Amount, Assigned Agent
  ✓ Status column shows: Active (green), Recalled (orange), Closed (default)

Step 2: Click on a customer row (ALPHA-001)
  ✓ Drawer opens on the right side (720px wide)
  ✓ Header shows: "Ramesh Kumar (ALPHA-001)" in Hero Finance NBFC
  ✓ Status tag: "Active" (green)
  ✓ If payment-driven bucket movement this month: "Normalized (pending confirmation)" badge

Step 3: Scroll through sections
  ✓ Identity section:
    - Loan Number, Customer Name, Bucket, Due Amount, EMI
    - Company Name
    - Status, Recalled At (empty for active)
  ✓ Detail Fields section (if selected during import):
    - Branch, State, any custom columns
    - Empty values show "-" (dash)
  ✓ Trail History section:
    - Timeline of call logs
    - Each entry: date, action_code, result_code, remarks, agent
    - If empty: "No calls logged"
  ✓ PTP section:
    - List of pending/kept/broken PTPs
    - Date, amount, status, agent
    - If empty: "No PTPs"
  ✓ Payments section:
    - Recent payments, newest first
    - Date, amount, reference
  ✓ Bucket Movements section:
    - Payment-driven and allocation-confirmed events
    - Date, from_bucket, to_bucket, trigger, month
  ✓ Allocation History section:
    - All assignments, newest first
    - From Agent → To Agent, date, reason
  ✓ Month Snapshots section:
    - One row per month of history
    - Month, bucket, due_amount, emi

Step 4: Close drawer (click X or click outside)
  ✓ Drawer slides out
  ✓ List visible again
```

**Edge Cases:**
- Customer with no call history → "No calls logged" message
- Recalled customer → all sections visible, status orange
- Customer with 10+ month snapshots → scrollable table
- Very long remarks → text wrapping in timeline
- Mobile view → drawer becomes full-screen

#### 5. Dashboard - All Cards

**Test Scenario:** Verify all dashboard widgets

```
Step 1: Dashboard Metrics (headline stats)
  ✓ Allocated Count: matches sum of month snapshots
  ✓ Allocated Amount: sum of due_amount
  ✓ Collected This Month: sum of payments this month
  ✓ Resolution %: (collected / (collected + arrears)) × 100
  ✓ Rollback %: bucket increased this month
  ✓ Normalization %: payment-driven bucket drops
  ✓ PTP %: PTPs kept / total PTPs

Step 2: Filters
  ✓ Month picker: select any month in history
  ✓ Company filter: multi-select (if multi-company user)
  ✓ Team filter: TL sees only their team
  ✓ Agent filter: agents see only themselves
  ✓ Product filter: select CVL, LPL, etc.
  ✓ Bucket filter: select X, 1, 2, NPA
  ✓ Status filter: Active, Recalled, Closed
  ✓ Apply filters → metrics recalculate

Step 3: Breakdown Table
  ✓ Dimension selector (dropdown): Company, Product, Bucket, Branch, Team, Agent
  ✓ Select dimension=Product
  ✓ Table rows: CVL (count, amount, collected), LPL, PBPLF
  ✓ Totals row reconciles with headline metrics
  ✓ Achievement % column shows progress bars

Step 4: Recalled Stat Tile
  ✓ Shows count of recalled customers this month
  ✓ Shows total amount of recalled cases
  ✓ Click to open modal

Step 5: Recalled Modal
  ✓ Tabs: "Customer List" and "By Company"
  ✓ By Company tab: summary table of recalled counts by company
  ✓ Customer List tab:
    - Pagination (if >10 rows)
    - Columns: Loan Number, Customer, Company, Recalled At, Last Bucket, Last Agent
    - Recalled At formatted as "DD MMM YYYY"
    - Last Agent resolved from allocation_logs

Step 6: Trail Analytics Card (if implemented)
  ✓ Shows counts by action_code (FU, PTP, CALLBACK, etc.)
  ✓ Shows result_code distribution (P, F, B, etc.)
  ✓ PTP conversion % and count
  ✓ Unique customers contacted

Step 7: Bucket Movements Card
  ✓ Shows payment-detected normalizations this month
  ✓ Shows allocation-confirmed movements (from last month's import)
  ✓ Link to detailed movement report

Step 8: Export
  ✓ "Export to Excel" button
  ✓ Downloads workbook with sheets:
    - Summary (headline metrics + breakdown)
    - Agents (per-agent stats)
    - Breakdown (by selected dimension)
    - Trail (call activity)
    - Recalls (detailed customer list)
    - Bucket Movements (detected + confirmed)
    - Bucket Mismatches (DPD cross-check)
  ✓ All sheets respect applied filters
```

**Edge Cases:**
- Select future month → no data, empty tables
- Select past month with no imports → no data
- Status=Recalled → excluded from denominators (or included?)
- Team leader filters by agent outside their team → 403 or filtered out?
- Export >100k rows → file still downloads (might be large)

#### 6. Import Review Page

**Test Scenario:** Review and approve/reject additions/removals

```
Step 1: Navigate to Import Review page
  ✓ Badge shows "2 Pending" (if 2 review items exist)
  ✓ Filter bar: Company, Type (Addition/Removal/Reactivation), Status
  ✓ Table columns: Type tag, Loan Number, Customer, Bucket, Amount, File, Age

Step 2: Click on pending addition (ALPHA-009)
  ✓ Row expands or modal opens
  ✓ Shows payload:
    - All mapped system fields: loan_number, customer_name, bucket, due_amount, emi
    - Custom fields: branch, state, etc.
  ✓ "Approve" button (green), "Reject" button (red)

Step 3: Click "Approve"
  ✓ Success message: "Addition approved"
  ✓ Row disappears from pending list (or status changes to "approved")
  ✓ Verify in Allocations: ALPHA-009 now visible, assigned to team

Step 4: Click on pending removal (ALPHA-004)
  ✓ Row expands, shows:
    - Loan number, customer name, current bucket
    - Context: last call log, pending PTP, MTD payments
  ✓ Approve button, Reject button, Note field

Step 5: Reject the removal
  ✓ Note field becomes visible
  ✓ Type note: "Customer called, will pay next week"
  ✓ Click "Reject"
  ✓ Success message: "Removal rejected"
  ✓ Verify in Allocations: ALPHA-004 still Active (not recalled)

Step 6: Bulk Approve
  ✓ Check checkboxes on multiple pending items
  ✓ "Approve Selected" button appears
  ✓ Click it
  ✓ All selected items approved in one transaction
  ✓ Verify: mixed statuses (some already approved) are skipped

Step 7: Re-import with new file
  ✓ Commit new import for same company, same month
  ✓ All old pending items for that company now status="superseded"
  ✓ New pending items from new diff appear
```

**Edge Cases:**
- Approve, then try to approve again → 409 Conflict error
- Logout mid-review → must re-authenticate (session guard)
- Telecaller tries to access review page → 403 Forbidden
- Operations manager can see and approve, field agent cannot

---

## Mobile (Flutter) Testing

### Running Mobile Tests

```bash
cd mobile

# Static analysis
flutter analyze

# Run on emulator
flutter run -d emulator-5554

# Run with specific flavor
flutter run --flavor demo

# Build APK
flutter build apk --release
```

### Manual Testing Checklist

#### 1. Mobile Login & Auth

```
Step 1: Launch app on Android emulator
  ✓ Splash screen shows Rudrayani logo
  ✓ Auto-navigates to login after 2 seconds

Step 2: Login screen
  ✓ Phone input: accepts 10-digit Indian phone
  ✓ Password input: masked characters
  ✓ "Login" button
  ✓ Form validates: prevents empty submission
  ✓ "Forgot Password?" link

Step 3: Login with valid telecaller phone
  ✓ Success: navigates to Worklist
  ✓ Toast: "Logged in as [Telecaller Name]"
  ✓ Nav drawer shows user name, phone, role

Step 4: Logout
  ✓ Nav menu > Logout
  ✓ Redirect to login
  ✓ Session cleared

Step 5: OTP Reset
  ✓ Tap "Forgot Password?"
  ✓ Enter phone, request OTP
  ✓ (Dev) OTP appears in console
  ✓ Enter OTP and new password
  ✓ Success, navigate back to login
  ✓ Login with new password succeeds
```

**Edge Cases:**
- Invalid phone format (8 digits, non-numeric) → error message
- Account locked (3 failed attempts) → error with countdown
- OTP expired → request new OTP
- Device binding: login on another device → old device session revoked

#### 2. Worklist & Call Logging

```
Step 1: Worklist page
  ✓ List of assigned customers
  ✓ Each card shows:
    - Loan number, customer name
    - Bucket tag (X, 1, 2, NPA), amount, EMI
    - Last call date (if called)
    - "Normalized (pending lender confirmation)" badge (if applicable)

Step 2: Open customer detail (tap card)
  ✓ New screen shows:
    - Full customer info (identity section)
    - Current bucket, due_amount, EMI
    - Call history (timeline)
    - Recent PTPs
    - Recent payments
    - Status (Active, Recalled, etc.)
  ✓ "Log Call" button (FAB or app bar)
  ✓ "New PTP" button

Step 3: Log a call
  ✓ Tap "Log Call"
  ✓ Form appears:
    - Date (pre-filled today)
    - Time (pre-filled now)
    - Duration (minutes)
    - Action code dropdown (FU, PTP, CALLBACK, etc.)
    - Result code dropdown (P, F, B, A, etc.)
    - Remarks text field
    - Disposition codes (checkboxes): needs_followup, needs_ptp, needs_payment, needs_address_update
  ✓ Fill form, submit
  ✓ Success: "Call logged"
  ✓ Call appears in timeline immediately
  ✓ Worklist card updates "last call" date

Step 4: Create PTP
  ✓ Tap "New PTP"
  ✓ Form:
    - Amount (pre-filled 0, user can change)
    - Date (date picker)
    - Time (time picker)
    - Remarks
  ✓ Submit
  ✓ Success: "PTP created"
  ✓ PTP appears in list
  ✓ If promise date is in future: status="pending"
  ✓ If promise date passed: status="broken" or "kept" (based on payments)

Step 5: Disposition codes
  ✓ If "needs_ptp" is checked, PTP creation is enforced/suggested
  ✓ If "needs_payment" is checked, payment screen can be accessed
  ✓ Remarks auto-composed from disposition selections:
    - "Customer requested followup" (needs_followup)
    - "PTP scheduled for 15-07-2026" (needs_ptp)
    - etc.
```

**Edge Cases:**
- Offline mode: logged call cached locally, synced when online
- Same call logged twice → idempotency via offline_uuid (no duplicates)
- PTP date in past → error or auto-correct to today?
- Character limit on remarks exceeded → warning or truncation?

#### 3. Customer Allocation & Assignment

```
Step 1: Allocations page (team leader only)
  ✓ Shows list of unallocated customers (assigned_agent_id = null)
  ✓ Also shows: allocation history for assigned customers

Step 2: Allocate a customer
  ✓ Long-press on unallocated customer
  ✓ "Assign to Agent" menu appears
  ✓ List of agents in team (not from other teams)
  ✓ Select an agent
  ✓ Confirm dialog: "Assign [Customer] to [Agent]?"
  ✓ Success: customer moves to that agent's worklist
  ✓ Allocation log created

Step 3: Unallocate / Re-allocate
  ✓ Long-press on allocated customer
  ✓ "Unallocate" option
  ✓ Confirm, unallocate
  ✓ Allocation log: from_agent=[Agent], to_agent=null

Step 4: View allocation history
  ✓ Customer detail > Allocation History section
  ✓ Timeline of all assignments
  ✓ Agent name, date, reason ("Assigned by import" vs "Reassigned by TL")
```

**Edge Cases:**
- Agent from different team → not available in list
- Allocate to self (TL as agent) → allowed or not?
- Allocate recalled customer → blocked or allowed?

#### 4. Performance & Delinquency Metrics

```
Step 1: My Performance page
  ✓ Shows:
    - My Active Count (customers assigned to me)
    - Collected This Month
    - Resolution %
    - Target vs Achievement
  ✓ Breakdown by bucket (X, 1, 2, NPA)
  ✓ Breakdown by product (CVL, LPL, PBPLF)

Step 2: Filters
  ✓ Month picker
  ✓ Product filter
  ✓ Bucket filter
  ✓ Metrics update on filter change

Step 3: Team Performance (TL only)
  ✓ Shows each agent's metrics
  ✓ Compare agent performance
  ✓ Drill down to individual agent
```

**Edge Cases:**
- Zero collections this month → Resolution % = 0%
- Agent with no allocated customers → empty state
- TL viewing own metrics vs team metrics → correct scoping

#### 5. Customer Recall Status

```
Step 1: Allocations list
  ✓ Filter by Status (Active / Recalled / Closed)
  ✓ Select Status=Recalled
  ✓ Shows all recalled customers

Step 2: Recalled customer card
  ✓ Status tag "Recalled" (orange)
  ✓ View details
  ✓ Can see all history (calls, PTPs, payments)
  ✓ Cannot create new calls, PTPs, payments (or can with warning?)

Step 3: Reactivation
  ✓ If customer is reactivated by import, status → Active
  ✓ Worklist automatically includes them again
```

**Edge Cases:**
- Try to log call on recalled customer → error or allowed?
- Try to allocate recalled customer → error or allowed?
- Reactivation of recalled → transitions back to active, restored in worklist

---

## End-to-End Testing

### E2E Test Execution

All E2E tests use the shared fixture builders in `backend/test/fixtures/` to ensure demo files and tests never drift.

**Running E2E:**
```bash
cd backend

# Full E2E with two companies, three months each
npm test -- e2e-allocation-lifecycle.test.ts

# Expected: 10 tests pass, ~30-45 seconds
```

### E2E Test Scenarios

#### Scenario 1: Alpha Finance - First-of-Month Import

```
Given: New allocation month (e.g., 2026-07)
When: Import alpha-finance-month1.xlsx (8 loans)
Then:
  ✓ Import run: mode=allocation, 8 inserted, 0 updated, 0 pending
  ✓ All 8 customers status=active
  ✓ Buckets discovered: [X, 1, 2, NPA]
  ✓ Products discovered: [CVL, LPL, PBPLF]
  ✓ Snapshots created for all 8 customers, month=2026-07-01
```

#### Scenario 2: Alpha Finance - Mid-Month Refresh (Removal + Addition)

```
Given: Same month (2026-07) with prior import
When: Import alpha-finance-month2-refresh.xlsx
  - ALPHA-004 is missing (removal)
  - ALPHA-009 is new (addition)
  - 7 existing loans have updated amounts/buckets

Then:
  ✓ Preview: 1 addition pending, 1 removal pending, 7 will update
  ✓ Commit: 0 inserted, 7 updated, 1 pending, 1 flagged
  ✓ Review queue has 2 items (addition + removal)
  ✓ Old pending items marked superseded
  ✓ Existing customers NOT recalled yet (awaiting review approval)
  ✓ New customer NOT inserted yet

When: Approve removal
Then:
  ✓ ALPHA-004 status=recalled, assigned_agent_id=null, recalled_at=now()
  ✓ Allocation log: assignment cleared
  ✓ Removed from worklist and unallocated queue

When: Approve addition
Then:
  ✓ ALPHA-009 inserted, status=active
  ✓ Assigned to same team (or TL-assigned)
  ✓ Snapshot created for 2026-07-01
  ✓ Appears in worklist
```

#### Scenario 3: Alpha Finance - Reactivation

```
Given: Prior month had ALPHA-004 as recalled
When: Import alpha-finance-month3-refresh.xlsx (ALPHA-004 reappears)

Then:
  ✓ Preview: 1 reactivation pending
  ✓ Commit: review item type=reactivation
  ✓ ALPHA-004 still recalled until approved

When: Approve reactivation
Then:
  ✓ ALPHA-004 status=active, recalled_at=null
  ✓ Updated with new bucket (1) and amount (41000)
  ✓ due_date=2026-07-02 (from emi_due_date column)
  ✓ Snapshot created
```

#### Scenario 4: DPD Cross-Check

```
Given: Canonical buckets mapped (X=0, 1=1, 2=2, NPA=3)
And: Customer ALPHA-008
  - Lender bucket: "X" (canonical 0)
  - due_date: 75 days ago (today - 75)
  - Implied DPD: 75 days → canonical floor(75/30)=2

When: Query GET /reports/bucket-mismatches?company_id=X

Then:
  ✓ ALPHA-008 appears in results (mismatch: lender=0, computed=2)
  ✓ Row shows: lender_bucket="X", lender_canonical=0, dpd=75, computed_canonical=2
  ✓ Other customers with agreeing buckets: not in results
  ✓ Recalled customers: not in results
  ✓ Customers without due_date: not in results
  ✓ Unmapped buckets: not in results
```

#### Scenario 5: Payment-Driven Bucket Movement

```
Given: Customer bucket="1" (canonical 1), emi=4000
And: Due amount > threshold (1 × 4000)

When: Record payment of 4000 (covers 1×EMI)

Then:
  ✓ Bucket_movement created: customer_id, trigger=payment, to_canonical=0
  ✓ Customers.bucket NOT modified (stays "1")
  ✓ Event visible on worklist badge "Normalized (pending confirmation)"
  ✓ Event visible on customer detail drawer

When: Record second qualifying payment same month

Then:
  ✓ No duplicate event (partial unique index prevents)
  ✓ Same bucket_movement row
```

#### Scenario 6: Allocation-Confirmed Movement

```
Given: Prior month snapshot has bucket="1" (canonical 1)
And: Next month import shows bucket="X" (canonical 0) for same customer

When: Import next month's allocation, commit

Then:
  ✓ Bucket_movement created: trigger=allocation, from_canonical=1, to_canonical=0
  ✓ Confirms the customer improved (bucket dropped)
  ✓ Event paired with prior month's payment-driven event (if applicable)
```

#### Scenario 7: Multi-Company Scope

```
Given: Two companies (Alpha Finance, Beta Credit)
And: Both have similar 3-month cycles with different columns

When: Run full test suite with both companies

Then:
  ✓ Company scoping: queries filter by company_id
  ✓ Dashboard metrics scoped to selected company
  ✓ Bucket mismatches only show loans from selected company
  ✓ Recalled report includes both companies (with by-company breakdown)
  ✓ TL queries return only their team's data (cross-company protection)
```

---

## Edge Cases & Error Scenarios

### Data Validation Edge Cases

#### Loan Number Normalization

```
Test Case: Loan number with whitespace/case
Given: File contains "  LOAN-001  " (uppercase)
And: Database has "loan-001" (lowercase, trimmed)

When: Import and diff

Expected:
  ✓ Normalized for comparison: upper() + trim() on both sides
  ✓ Treated as same loan (update, not addition)
  ✓ Stored as-is (trimmed but original case from file)
```

#### Missing Required Fields

```
Test Case: Due Amount = 0 or NULL
When: Import customer with no due_amount

Expected:
  ✓ Row error: "Due Amount is required"
  ✓ Row skipped, not inserted
  ✓ Error count incremented
  ✓ Preview shows error row (first 5 errors)

Test Case: EMI = NULL and bucket = "1" (needs threshold)
When: Record payment
Expected:
  ✓ Fall back to due_amount for threshold calculation
  ✓ If due_amount also NULL: skip event (undetectable)
```

#### Date Parsing Edge Cases

```
Test Case: Due date in multiple formats
Given: Excel file with due_date column
  - Some cells: "15-06-2026" (DD-MM-YYYY)
  - Some cells: "2026-06-15" (YYYY-MM-DD)
  - Some cells: invalid date "32-13-2026"

When: Import and parse

Expected:
  ✓ Both formats parsed correctly
  ✓ Invalid dates: row error, skipped
  ✓ All dates stored as DATE type (YYYY-MM-DD in DB)
  ✓ Serialized via JSON as strings (not Date objects with timezone drift)
```

#### Bucket Mapping Edge Cases

```
Test Case: Customer with unmapped bucket
Given: Bucket label="SPECIAL" with canonical_bucket=NULL
And: Customer assigned to this bucket

When: Attempt to record payment or trigger movement detection

Expected:
  ✓ No event generated (canonical is null, skip)
  ✓ No error (graceful degradation)
  ✓ Warning tag "Unmapped" visible in bucket admin

Test Case: Multiple current buckets
Given: Two buckets with is_current=true

When: Set canonical_bucket=0 on second bucket

Expected:
  ✓ Auto-clear is_current on first bucket
  ✓ Or error: "Only one bucket can be current"
```

### Concurrency & Race Conditions

```
Test Case: Simultaneous imports for same company, same month
Given: Two operators upload files for 2026-07 at the same time

When: Both imports reach commit endpoint

Expected:
  ✓ First commit succeeds
  ✓ Second commit succeeds (or one of them supersedes and marks other's pending items superseded)
  ✓ No data corruption
  ✓ Final state: latest file's diff is active

Test Case: Approve review item while new import arrives
Given: Review item pending for removal
When: New import for same month arrives (supersede)
And: Operator approves old item simultaneously

Expected:
  ✓ One of two outcomes (both acceptable):
    - Old item already superseded → approve returns 409 (superseded, can't approve)
    - OR old item approved, then superseded by new import → both valid states
  ✓ No orphan records
  ✓ No duplicate customer creation
```

### Authorization & Scope Checking

```
Test Case: Telecaller tries to approve review item
When: GET /api/import-reviews (telecaller token)

Expected:
  ✓ 403 Forbidden
  ✓ Error message: "Permission denied: imports.review"

Test Case: Field agent tries to view other agent's customer
When: GET /customers/:id (field_agent token, not assigned to customer)

Expected:
  ✓ 404 Not Found (not 403, to avoid leaking existence)
  ✓ Error message: "Customer not found"

Test Case: Team leader tries to view another team's metrics
When: Dashboard filter by team outside their own

Expected:
  ✓ Filter silently clamped to own team
  ✓ OR 403 Forbidden if attempting to query explicitly
  ✓ No metrics from other teams visible
```

### State Transition Edge Cases

```
Test Case: Recall → Reactivate → Recall again
Given: ALPHA-004 recalled in month 2
When: Month 3 reactivation imported and approved
Then: ALPHA-004 active again

When: Month 4 removal imported (ALPHA-004 missing)
Then:
  ✓ Treated as removal (from active), goes to review
  ✓ Approve: status=recalled (again)
  ✓ No conflicts with prior recalled_at

Test Case: Close → Reactivate
Given: Customer status=closed (manually or by lender action)
When: Reactivation imported

Expected:
  ✓ Treated as reactivation (from closed)
  ✓ Approve: status=active
  ✓ Both close and recall can be transitioned from
```

---

## Performance & Load Testing

### Benchmark Scenarios

#### Scenario 1: Large Allocation Import (10k+ loans)

```bash
# Generate large file
python3 -c "
import openpyxl
wb = openpyxl.Workbook()
ws = wb.active
ws['A1'], ws['B1'], ws['C1'] = 'loan_number', 'customer', 'bucket'
for i in range(10000):
    ws.append([f'LOAN-{i:06d}', f'Customer {i}', 'X'])
wb.save('large-allocation.xlsx')
"

# Upload and measure
time curl -X POST http://localhost:4000/api/imports/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@large-allocation.xlsx"

# Expected:
# ✓ Upload: <30 seconds
# ✓ Parse: <5 seconds
# ✓ Diff: <10 seconds
# ✓ Commit: <30 seconds
# ✓ Total: <2 minutes for 10k loans
```

#### Scenario 2: Batch Payment Recording (100 payments)

```bash
# Record 100 payments in a loop
for i in {1..100}; do
  curl -X POST http://localhost:4000/api/payments \
    -H "Authorization: Bearer $TOKEN" \
    -F "customer_id=$CUSTOMER_ID_$i" \
    -F "amount=5000"
done

# Expected:
# ✓ Each payment: <500ms
# ✓ Bucket movement detection: <100ms
# ✓ 100 payments: <2 minutes total
# ✓ No duplicates, no missing events
```

#### Scenario 3: Dashboard Metrics (1M+ snapshots)

```bash
# Create large dataset (seed 100 companies, 12 months history)
npm run seed:stress-test -- --companies 100 --months 12

# Query dashboard
time curl -X GET "http://localhost:4000/api/reports/dashboard?month=2026-07" \
  -H "Authorization: Bearer $TOKEN"

# Expected:
# ✓ Query execution: <2 seconds
# ✓ JSON serialization: <1 second
# ✓ Total response: <3 seconds
# ✓ No timeout, no memory errors
```

### Database Query Optimization

```
Monitor these queries:

1. Worklist (most frequently hit)
   SELECT * FROM customers c
   JOIN customer_month_snapshots s ON c.id = s.customer_id
   WHERE c.assigned_agent_id = $1 AND s.month = $2
   Expected: <100ms for 500 customers

2. Dashboard metrics (heavy JOIN)
   SELECT SUM(s.due_amount), COUNT(c.id), ... FROM customers c
   LEFT JOIN customer_month_snapshots s ...
   LEFT JOIN bucket_movements bm ...
   Expected: <2 seconds for 1M rows

3. Bucket mismatches (DPD calculation)
   SELECT c.id, ..., EXTRACT(DAY FROM (CURRENT_DATE - c.due_date)) as dpd
   ...
   Expected: <500ms for 10k active customers

Indexes to verify:
  ✓ customers(company_id, status, assigned_agent_id)
  ✓ customer_month_snapshots(customer_id, month)
  ✓ bucket_movements(company_id, month, trigger)
  ✓ call_logs(customer_id, created_at)
  ✓ payments(customer_id, created_at)
```

---

## Security Testing

### Input Validation

```
Test Case: SQL Injection
Given: Loan number input = "'; DROP TABLE customers; --"
When: Import and insert

Expected:
  ✓ Sanitized via parameterized queries
  ✓ Treated as literal string in loan_number column
  ✓ No SQL executed

Test Case: XSS via Remarks
Given: Remarks = "<script>alert('xss')</script>"
When: Log call, display in UI

Expected:
  ✓ Remarks escaped when rendered (AntD handles this)
  ✓ Script not executed
  ✓ Displayed as literal text
```

### Authentication & Token Security

```
Test Case: JWT Tampering
Given: Valid JWT token
When: User modifies payload (change role admin=true)
And: Sends request

Expected:
  ✓ Signature verification fails
  ✓ 401 Unauthorized
  ✓ No privilege escalation

Test Case: Refresh Token Reuse
Given: Used refresh token
When: Attempt to use again

Expected:
  ✓ 401 Unauthorized
  ✓ (If implemented: rotation, old token blacklisted)

Test Case: Device Binding
Given: Session from Device A
When: Login again from Device B

Expected:
  ✓ Device A session revoked
  ✓ Device B session active
  ✓ No concurrent sessions (same account, different device)
```

### Permission Boundary Testing

```
Test Case: Agent views recalled customer's payments
Given: Field agent assigned to customer
When: Customer is recalled (agent assignment cleared)
And: Agent tries to access customer detail

Expected:
  ✓ 404 Not Found (not 200, not 403)
  ✓ Agent cannot see payments, calls, etc.

Test Case: Team leader allocates across teams
Given: Team Lead for Team A
When: Attempt to allocate to agent in Team B

Expected:
  ✓ Agent list filtered to Team A only
  ✓ Team B agents not available
  ✓ If forced via API: 403 Forbidden

Test Case: Multi-company user scope
Given: Admin for Company A
When: Query dashboard with company_id=Company B

Expected:
  ✓ 403 Forbidden (if company mismatch)
  ✓ OR silently filter to Company A
  ✓ No data leakage
```

### Data Privacy & GDPR Compliance

```
Test Case: Customer data export
Given: Export button pressed, user selects all data
When: Download workbook

Expected:
  ✓ Workbook contains all selected data (PII included)
  ✓ Workbook is encrypted (optional, depends on compliance)
  ✓ Data scoped to user's permission level (no cross-team/company leakage)

Test Case: Deletion (if supported)
Given: Customer deleted request
When: Process deletion

Expected:
  ✓ Soft delete: status=deleted, or hard delete with audit log
  ✓ Related data (calls, payments, movements) also deleted or cascaded
  ✓ Audit log records who deleted when
```

---

## Regression Testing Checklist

After each major change, verify:

- [ ] **Phase 7 Features Still Work**
  - [ ] Allocation import (first-of-month + repeat)
  - [ ] Review queue (approve/reject additions/removals/reactivations)
  - [ ] DPD cross-check (bucket mismatches report)
  - [ ] Bucket movements (payment-driven + allocation-confirmed)
  - [ ] Recalled customer report (detailed list + by-company)
  - [ ] Dashboard all cards render with live data
  - [ ] Mobile worklist shows normalized-pending badge
  - [ ] Export workbook includes all 8 sheets

- [ ] **Authorization Still Enforced**
  - [ ] Telecaller cannot access Review page (403)
  - [ ] Agent cannot view other team's customers (404)
  - [ ] Team leader cannot approve/reject (403)

- [ ] **No Performance Regressions**
  - [ ] Dashboard loads in <3 seconds
  - [ ] Worklist loads in <1 second
  - [ ] Export completes in <10 seconds
  - [ ] No N+1 query issues

- [ ] **No Data Corruption**
  - [ ] Recalls have correct recalled_at timestamp
  - [ ] Snapshots created for all imported customers
  - [ ] Bucket movements deduplicated (no duplicate payment events)
  - [ ] Allocation logs chain correctly (from_agent → to_agent)

---

## Test Report Template

```markdown
# Test Report - [Date]

## Summary
- Total Tests: 198
- Passed: 198
- Failed: 0
- Skipped: 0
- Coverage: 85%

## Execution Time
- Backend: 45 seconds
- Frontend: 15 seconds (typecheck only)
- Mobile: 20 seconds (analyze)
- Total: ~80 seconds

## Tested Features
- [x] Phase 7 Allocation Lifecycle
- [x] Import Review Queue
- [x] DPD Cross-Check
- [x] Bucket Movements
- [x] Recalled Customer Report
- [x] Customer 360 Drawer
- [x] Dashboard All Cards
- [x] Role-Based Scope Clamping
- [x] Multi-Company Isolation
- [x] Mobile Parity

## Known Issues / Blockers
- None

## Edge Cases Verified
- [x] Loan number normalization (whitespace, case)
- [x] Date format handling (DD-MM-YYYY, YYYY-MM-DD)
- [x] Unmapped buckets (graceful skip)
- [x] Concurrent imports (supersede old pending)
- [x] Payment-driven events (deduplication)
- [x] Recalled state transitions (recall → reactivate → recall)

## Recommendations
- Continue monitoring performance on >10k customer imports
- Add encryption for exported workbooks (PII consideration)
- Consider rate limiting on payment recording endpoint
```

---

## Debugging Guide

### Common Issues & Solutions

#### Issue: Tests fail with "pool.end() called while client is still checked out"

**Cause:** Test cleanup not waiting for queries to complete

**Solution:**
```typescript
afterAll(async () => {
  await pool.query(`DELETE ...`);
  // Don't forget to await everything
  await pool.end();
});
```

#### Issue: DPD calculation off by one day

**Cause:** Timezone drift in DATE serialization

**Solution:**
```typescript
// In db.ts:
types.setTypeParser(1082, (value) => value); // Return raw YYYY-MM-DD string
```

#### Issue: Bucket movement duplicates created

**Cause:** Unique index not preventing duplicates

**Solution:**
```sql
-- Ensure this partial unique index exists:
CREATE UNIQUE INDEX idx_bucket_movements_payment_once
  ON bucket_movements (customer_id, month) WHERE trigger = 'payment';
```

#### Issue: Mobile app crashes on login

**Cause:** `disposition_codes` key mismatch in worklist_provider

**Solution:**
```dart
// Fix in worklist_provider.dart:
final codes = (res.data!['disposition_codes'] as List).map(...);
// Not: res.data!['codes']
```

---

## Continuous Integration

All tests run automatically on:
- Every push to `worktree-*` branches
- Every PR creation
- Nightly full suite + performance benchmarks
- Before merging to `main`

See `.github/workflows/test.yml` for CI configuration.

---

## Sign-Off

- **Version:** Phase 7 Correction (2026-07-07)
- **Last Verified:** 2026-07-07
- **Tested By:** QA Team
- **Status:** ✅ Ready for Production

