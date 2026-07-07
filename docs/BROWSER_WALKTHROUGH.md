# Rudrayani Fintech CRM - Browser Walkthrough Guide

**How to Navigate & Test the Application**

---

## Getting Started

### Prerequisites
```bash
# Terminal 1: Start Docker containers
docker compose up -d

# Terminal 2: Start Backend Server (port 4000)
cd backend
npm run dev
# You should see: "Server running on http://localhost:4000"

# Terminal 3: Start Frontend Server (port 5173)
cd frontend
npm run dev
# You should see: "Local: http://localhost:5173"
```

### Access the Application
**Open your browser and go to:**
```
http://localhost:5173
```

You'll see the login page.

---

## Complete User Journey

### Step 1: Login as Admin

**URL:** http://localhost:5173/login

**Screenshot (what you'll see):**
```
┌─────────────────────────────────────────┐
│         Rudrayani Fintech CRM            │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │ Email/Phone                      │   │
│  │ [                               ]│   │
│  │                                  │   │
│  │ Password                         │   │
│  │ [                               ]│   │
│  │                                  │   │
│  │        [ Login Button ]           │   │
│  │    Forgot Password?               │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**What to do:**
1. Enter phone: `7970000090` (admin user from seed)
2. Enter password: `Secret@123`
3. Click "Login"
4. Expected result: Dashboard loads

---

### Step 2: Explore the Dashboard

**URL:** http://localhost:5173/dashboard

**Layout breakdown:**

```
┌────────────────────────────────────────────────────────────┐
│ Admin User (top right)  [ ✓ Logout ]                       │
├────────────────────────────────────────────────────────────┤
│ Left Sidebar                                                │
│ ☰ Rudrayani CRM                                             │
│   ├─ Dashboard       ← YOU ARE HERE                         │
│   ├─ Imports                                                │
│   ├─ Review Queue                                           │
│   ├─ Allocations                                            │
│   ├─ Buckets (Admin)                                        │
│   ├─ Reports                                                │
│   └─ Settings                                               │
├────────────────────────────────────────────────────────────┤
│ Main Content Area                                           │
│                                                             │
│ Filter Bar:                                                 │
│ [Month: July 2026] [Company] [Team] [Agent] [Product]      │
│                                                             │
│ Metric Cards (Row 1):                                       │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│ │Allocated │  │Collected │  │Resolution│  │Rollback %│   │
│ │  Count   │  │  Amount  │  │    %     │  │          │   │
│ │   120    │  │  180 k   │  │   15%    │  │    5%    │   │
│ └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│                                                             │
│ Dashboard Cards (Row 2):                                    │
│ ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │
│ │  Breakdown    │  │   Trail       │  │ Recalled      │   │
│ │  by Product   │  │  Analytics    │  │ Customers     │   │
│ │               │  │               │  │               │   │
│ └───────────────┘  └───────────────┘  └───────────────┘   │
│                                                             │
│ ┌───────────────────────────────────┐                      │
│ │   Bucket Movements Card           │                      │
│ │   (Payment-driven + Allocation)   │                      │
│ └───────────────────────────────────┘                      │
│                                                             │
│ ┌───────────────────────────────────┐                      │
│ │   Bucket Mismatches (DPD Check)   │                      │
│ │   (Shows loans with DPD/bucket    │                      │
│ │    discrepancies)                 │                      │
│ └───────────────────────────────────┘                      │
└────────────────────────────────────────────────────────────┘
```

**What to click and explore:**

1. **Metric Cards**: Click each to see drill-down
   - Allocated Count: Shows total customers for the month
   - Collected Amount: Sum of all payments this month
   - Resolution %: (Collected / Arrears) × 100

2. **Breakdown by Product**: 
   - Shows collection by product type (CVL, LPL, PBPLF)
   - Click dimension selector to change to "By Bucket", "By Agent", etc.

3. **Trail Analytics**:
   - Bar chart of call activity (action codes)
   - PTP conversion %
   - Call frequency

4. **Recalled Customers**:
   - Count of customers recalled this month
   - Click "View Details" modal with two tabs:
     - By Company: Summary of recalls per company
     - Customer List: Detailed list with names, dates, last agents

5. **Bucket Movements**:
   - Payment-detected normalizations this month
   - Allocation-confirmed movements from next month's import

6. **Bucket Mismatches**:
   - Loans where lender's bucket ≠ computed DPD
   - Shows: Loan#, Customer, Lender Bucket, Due Date, DPD, Computed Bucket
   - Click row to open customer detail drawer

---

### Step 3: Import an Allocation File

**URL:** http://localhost:5173/imports

**Visual flow:**

```
Step 1: Upload Section
┌─────────────────────────────────────┐
│ Drop file here or click to browse   │
│                                     │
│ Accepted: .xlsx, .csv              │
└─────────────────────────────────────┘
                ↓
Step 2: File Detected → Auto-advance to Column Mapping
┌─────────────────────────────────────┐
│ File: hero-allocation-month1.xlsx   │
│ Rows: 8                             │
│ Size: 12 KB                         │
│                                     │
│ [Next]                              │
└─────────────────────────────────────┘
                ↓
Step 3: Map Columns
┌─────────────────────────────────────┐
│ File Column  →  System Field        │
│ loan_agreement_no  →  loan_number   │
│ customername  →  customer_name      │
│ Bkt  →  bucket                      │
│ PROD  →  product                    │
│ pos  →  due_amount                  │
│ emi_amount  →  emi                  │
│                                     │
│ ☑ branch (detail field)             │
│ ☑ state (detail field)              │
│                                     │
│ [ Save as Template ] [Next]         │
└─────────────────────────────────────┘
                ↓
Step 4: Preview & Commit
┌─────────────────────────────────────┐
│ Import Preview:                     │
│ Company: Alpha Finance NBFC         │
│ Mode: Allocation                    │
│ Month: 2026-07-01                   │
│                                     │
│ 8 rows will be inserted             │
│ 0 pending review                    │
│ New buckets: [X, 1, 2, NPA]         │
│ New products: [CVL, LPL, PBPLF]     │
│                                     │
│ [ Commit Import ]                   │
└─────────────────────────────────────┘
                ↓
Step 5: Success
"Import complete: 8 inserted, 0 updated, 0 pending"
Redirect to Dashboard
```

**Detailed steps to test:**

```
1. Click [Upload] or drag file
   File: backend/test/fixtures/alpha-finance-month1.xlsx
   
2. Column mapping auto-fills
   - Verify mappings are correct
   - Select detail fields: branch, state, zone (any you want)
   - Click [Save as Template "Hero Finance - Standard"]

3. Preview shows:
   - 8 insertions expected
   - New buckets: X, 1, 2, NPA
   - New products: CVL, LPL, PBPLF

4. Click [Commit Import]
   - Expected: Success message
   - Dashboard updates: Allocated Count = 8

5. Dashboard verification:
   - Allocated Count card now shows 8
   - Breakdown shows distribution by product/bucket
```

---

### Step 4: Review Allocation (Mid-Month Refresh)

**URL:** http://localhost:5173/imports (again, for second file)

**Scenario:** Mid-month refresh with additions & removals

```
Repeat: Upload alpha-finance-month2-refresh.xlsx

Preview will show:
  ✓ 7 will be updated (existing loans)
  ✗ 1 addition pending review (ALPHA-009)
  ✗ 1 removal pending review (ALPHA-004)

After commit: You'll see badge "3 Pending" on sidebar
```

**Navigate to Review Queue:**

**URL:** http://localhost:5173/reviews

**Visual layout:**

```
┌─────────────────────────────────────────────────────┐
│ Import Review Queue                    [3 Pending] │
├─────────────────────────────────────────────────────┤
│ Filter: [Company] [Type: All/Add/Remove/Reactivate]│
│         [Status: Pending/Approved/Rejected]         │
├─────────────────────────────────────────────────────┤
│ Table:                                              │
│ Type      │ Loan #    │ Customer      │ Amount      │
│ ─────────────────────────────────────────────────   │
│ Add       │ ALPHA-009 │ Rohit Bhatia  │ 28,000      │
│ ─────────────────────────────────────────────────   │
│ Remove    │ ALPHA-004 │ Priya Singh   │ 40,000      │
│ ─────────────────────────────────────────────────   │
│ ...                                                 │
└─────────────────────────────────────────────────────┘

Click row to expand:
┌──────────────────────────────────────────┐
│ ALPHA-009 - Rohit Bhatia                 │
│                                          │
│ Payload:                                 │
│ • loan_number: ALPHA-009                 │
│ • customer_name: Rohit Bhatia            │
│ • bucket: 1 (30-60 DPD)                  │
│ • due_amount: 28,000                     │
│ • emi: 2,800                             │
│ • branch: Mumbai                         │
│ • state: MH                              │
│                                          │
│ [Approve]  [Reject]  [Note: ...]         │
└──────────────────────────────────────────┘
```

**To approve:**
```
1. Click row to expand detail
2. Review the payload
3. Click [Approve]
4. Confirm: "Approve addition ALPHA-009?"
5. ✓ Row status → "Approved"
6. Verify: Allocations page now shows ALPHA-009 active
```

---

### Step 5: Configure Buckets (Map Canonical)

**URL:** http://localhost:5173/buckets

**Visual:**

```
┌──────────────────────────────────────────────────┐
│ Buckets Admin                                    │
├──────────────────────────────────────────────────┤
│ Label  │ Sort │ Canonical │ Is Current │ Action │
│ ──────────────────────────────────────────────   │
│ X      │ 0    │ null      │ ☑ Yes      │ [Edit] │
│ 1      │ 1    │ null      │ ☐ No       │ [Edit] │
│ 2      │ 2    │ null      │ ☐ No       │ [Edit] │
│ NPA    │ 3    │ null      │ ☐ No       │ [Edit] │
└──────────────────────────────────────────────────┘

Click [Edit] on X:
┌──────────────────────────────────────┐
│ Edit Bucket: X                       │
│                                      │
│ Label: X                             │
│ Sort Order: 0                        │
│ Canonical Bucket: [__]  (0=current)  │
│ Is Current: [✓]                      │
│                                      │
│ [Cancel] [Save]                      │
└──────────────────────────────────────┘
```

**To map:**
```
1. Click [Edit] on bucket X
2. Set Canonical = 0
3. Click [Save]
   (Is Current auto-checked since canonical=0)
4. Repeat for:
   - Bucket 1 → Canonical 1
   - Bucket 2 → Canonical 2
   - Bucket NPA → Canonical 3
5. Verify: Dashboard Bucket Mismatches card now shows live data
```

---

### Step 6: View DPD Cross-Check (Bucket Mismatches)

**URL:** http://localhost:5173/dashboard (scroll to bottom)

**After canonical mapping, the "Bucket Mismatches" card shows:**

```
┌─────────────────────────────────────────────────────┐
│ Bucket Mismatches (DPD Cross-Check)                │
├─────────────────────────────────────────────────────┤
│ Loan No  │ Customer        │ Lender Bkt │ DPD     │
│          │                 │ (Canonical)│ (Impl)  │
│ ─────────────────────────────────────────────────   │
│ ALPHA-008│ Deepa Menon     │ X (0)      │ 75 (2) ✗│  Mismatch!
│ ─────────────────────────────────────────────────   │
│ (other customers agree, not shown)                  │
│                                                     │
│ Pagination: 1-1 of 1                               │
│                                                     │
│ [Export to Excel]                                  │
└─────────────────────────────────────────────────────┘

Click row to open customer detail drawer:
```

---

### Step 7: View Customer Detail (360° View)

**URL:** Auto-opens in drawer when clicking customer

**Click on ALPHA-008 or from Allocations page:**

```
┌──────────────────────────────────────────┐ ╭──────╮
│ Dashboard or Allocations...              │ │Drawer│
│                                          │ ├──────┤
│ Click ALPHA-008 row                      │ │
│                                          │ │ Deepa Menon
│ ┌────────────────────────────────────┐  │ │ ALPHA-008 (Hero Finance)
│ │ ALPHA-008 Deepa Menon   [X Close]  │  │ │
│ │                                    │  │ │ Status: Active
│ │ [5 Sections, scroll down]          │  │ │
│ │                                    │  │ │ ┌─────────────────┐
│ │ 1. Identity Section                │  │ │ │ Loan: ALPHA-008 │
│ │    Loan #, Name, Company, Bucket   │  │ │ │ Customer: Deepa │
│ │    Due Amount, EMI, Status         │  │ │ │ Company: Hero    │
│ │                                    │  │ │ │ Bucket: X        │
│ │ 2. Detail Fields Section           │  │ │ │ Due Amount: 19.5k│
│ │    Branch: Mumbai                  │  │ │ │ EMI: 1900        │
│ │    State: MH                       │  │ │ │ Status: Active   │
│ │    Zone: North (if in import)      │  │ │ │                 │
│ │                                    │  │ │ │ [Load more ↓]   │
│ │ 3. Trail History (last 50 calls)   │  │ │ └─────────────────┘
│ │    Timeline:                       │  │ │
│ │    2026-07-05 10:30 | Rajesh       │  │ │
│ │    Action: FU | Result: P          │  │ │
│ │    "Will pay next week"            │  │ │
│ │                                    │  │ │
│ │ 4. PTPs (Promised To Pay)          │  │ │
│ │    5000 on 15-07 (Pending)         │  │ │
│ │                                    │  │ │
│ │ 5. Payments                        │  │ │
│ │    2026-07-01: 5000 (TX-123456)    │  │ │
│ │                                    │  │ │
│ │ 6. Bucket Movements                │  │ │
│ │    2026-07-01: X→X (Payment)       │  │ │
│ │    Normalized pending confirmation │  │ │
│ │                                    │  │ │
│ │ 7. Allocation History              │  │ │
│ │    2026-07-01: None → Rajesh       │  │ │
│ │                                    │  │ │
│ │ 8. Month Snapshots                 │  │ │
│ │    2026-07: Bucket X, Due 19.5k    │  │ │
│ │    2026-06: Bucket X, Due 19k      │  │ │
│ └────────────────────────────────────┘  │ │
└──────────────────────────────────────────┘ ╰──────╯
```

**What to explore:**
- Scroll through all sections
- See call history timeline
- Click PTP to edit
- Note "Normalized" status if applicable
- View month-by-month progression

---

### Step 8: Allocations (Assign Customers)

**URL:** http://localhost:5173/allocations

**View all active customers:**

```
┌────────────────────────────────────────────────┐
│ Allocations                                    │
├────────────────────────────────────────────────┤
│ Filter: [Status: Active/Recalled/Closed]       │
│         [Unallocated / All]                    │
│         [Company] [Team] [Agent]               │
├────────────────────────────────────────────────┤
│ Table:                                         │
│ Loan # │ Customer │ Bucket │ Amount │ Agent  │
│ ──────────────────────────────────────────     │
│ ALPHA-001 │ Ramesh │ X     │ 15,000 │ Rajesh│
│ ALPHA-002 │ Sita   │ 1     │ 25,000 │ Priya │
│ ALPHA-003 │ Manoj  │ 1     │ 30,000 │ -     │ ← Unallocated
│ ALPHA-009 │ Rohit  │ 1     │ 28,000 │ -     │ ← Unallocated
│ ──────────────────────────────────────────────
│ (Recalled customers appear in separate section)
│ ALPHA-004 │ Priya  │ 1     │ 41,000 │ -     │ Recalled
└────────────────────────────────────────────────┘

To allocate:
1. Click on ALPHA-003 (Manoj, unallocated)
2. Open context menu (right-click or action button)
3. "Assign to Agent"
4. Select agent from dropdown (Rajesh, Priya, etc.)
5. Confirm: "Assign ALPHA-003 to Rajesh?"
6. ✓ Agent column updates to "Rajesh"
7. Allocation log created (visible in customer detail drawer)
```

---

### Step 9: View Reports & Export

**URL:** http://localhost:5173/reports (or Dashboard > Export)

**Export workbook with 8 sheets:**

```
Click [Export to Excel] button:
↓
Downloads: rudrayani-fintech-2026-07.xlsx
↓
Workbook tabs:
1. Summary (Headline metrics + snapshots)
2. Agents (Per-agent performance)
3. Breakdown (By selected dimension: Product/Bucket/Team)
4. Trail (Call activity + PTP conversion)
5. Recalls (Customers recalled this month)
6. Bucket Movements (Payment + Allocation-driven)
7. Bucket Mismatches (DPD cross-check)
8. Raw Data (All snapshots, calls, payments)

Each sheet respects applied filters:
  • Month
  • Company
  • Team
  • Agent
  • Product
  • Bucket
  • Status (Active/Recalled/Closed)
```

---

### Step 10: Test Complete E2E Scenario

**For full testing, run multi-company, multi-month scenario:**

```bash
# This is automated in the E2E test, but you can manually replicate:

1. Start fresh:
   docker compose down -v && docker compose up -d
   cd backend && npm run seed:demo

2. Login as admin (7970000090 / Secret@123)

3. Upload Month 1:
   File: alpha-finance-month1.xlsx
   Commit: 8 inserted, 0 pending
   ✓ Dashboard shows 8 allocated

4. Upload Month 2 (refresh, same month):
   File: alpha-finance-month2-refresh.xlsx
   Commit: 0 inserted, 1 addition + 1 removal pending
   → Review queue shows 2 pending
   → Approve removal (ALPHA-004 → recalled)
   → Approve addition (ALPHA-009 → active)
   ✓ Dashboard now shows 8 (7 unchanged + ALPHA-009 - ALPHA-004)

5. Map canonical buckets:
   X → 0, 1 → 1, 2 → 2, NPA → 3

6. Dashboard now shows:
   ✓ Bucket Mismatches card (live data)
   ✓ ALPHA-008 flagged (lender=X, DPD=75)
   ✓ Other customers showing agreement

7. Record a payment:
   Customer ALPHA-004 (bucket=1)
   Amount: 4000 (1×EMI, covers threshold)
   → Bucket movement event created
   → "Normalized" badge appears on customer
   → Event visible in customer detail drawer
   → Second payment same month: no duplicate (unique index)

8. Upload Month 3:
   File: alpha-finance-month3-refresh.xlsx
   Commit: includes reactivation
   → ALPHA-004 reactivation goes to review
   → Approve: status=active (no longer recalled)
   → Can now be called again

9. Dashboard metrics reflect:
   ✓ Resolution % updated
   ✓ Bucket movements show payment + allocation events
   ✓ Recalled count decreased (ALPHA-004 reactivated)
   ✓ All filters and exports working
```

---

## Troubleshooting While Testing

### "Dashboard not loading"
**Check:**
1. Backend running: `curl http://localhost:4000/api/health` → should show `{"status":"ok"}`
2. Frontend running: `curl http://localhost:5173` → should return HTML
3. Database connected: `docker compose logs postgres` → no errors
4. Clear browser cache: Ctrl+Shift+Delete

### "Login fails"
**Check:**
1. Correct credentials: `7970000090` / `Secret@123`
2. Backend seeded: `npm run seed:demo`
3. Database migrations: `npm run migrate:up` completed

### "Import file not accepted"
**Check:**
1. File format: .xlsx (Excel), not .csv
2. File location: `backend/test/fixtures/alpha-finance-month*.xlsx`
3. File columns match mapping requirements

### "Bucket mismatches not showing"
**Check:**
1. Canonical buckets mapped: Admin → Buckets, set Canonical for each
2. Customers have due_date: From alpha-finance-month3 file (includes emi_due_date column)
3. Bucket mismatches card visible: Scroll dashboard to bottom

### "Customer detail drawer not opening"
**Check:**
1. Click on row in Allocations or dashboard
2. Drawer should slide in from right side
3. If not: refresh page, try again
4. Check console (DevTools F12) for errors

---

## API Testing (Advanced)

If you want to test backend API directly with curl:

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"7970000090","password":"Secret@123"}' | jq -r '.access_token')

# Get dashboard metrics
curl -s http://localhost:4000/api/reports/dashboard?month=2026-07 \
  -H "Authorization: Bearer $TOKEN" | jq '.'

# Get bucket mismatches
curl -s http://localhost:4000/api/reports/bucket-mismatches?company_id=XXX \
  -H "Authorization: Bearer $TOKEN" | jq '.'

# Get import review queue
curl -s http://localhost:4000/api/import-reviews?status=pending \
  -H "Authorization: Bearer $TOKEN" | jq '.'

# Approve a review item
curl -s -X POST http://localhost:4000/api/import-reviews/ITEM_ID/decision \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"approve","note":"Verified"}' | jq '.'
```

---

## Mobile App Testing

If you want to test on mobile (Flutter):

```bash
# Terminal: Start mobile app
cd mobile
flutter run -d emulator-5554

# The same workflows apply on mobile:
# - Worklist (view allocated customers)
# - Call logging (log calls with disposition codes)
# - PTP creation (create promised-to-pay commitments)
# - Payment recording (record payments received)
# - Allocation (assign customers to agents, TL only)
```

---

## Sign-Off

**You now have:**
- ✅ Complete browser walkthrough
- ✅ Step-by-step screenshots (ASCII mockups)
- ✅ URLs for each major feature
- ✅ Click paths from login to exports
- ✅ Multi-company E2E scenario walkthrough
- ✅ Troubleshooting guide
- ✅ API testing examples
- ✅ Mobile testing instructions

**Time to complete full walkthrough:** ~30 minutes (first time), 5 minutes (subsequent)

**Recommendation:** Follow steps 1-9 in order for first run, then explore freely.
Each time you upload a file, you're testing a critical workflow that collection agency staff will use daily.

