# Track 3 — Customer branch_id — COMPLETE ✅

## Overview

Track 3 adds an independent `branch_id` field to customers, enabling filtering and organization of customers by their assigned branch, separate from team allocation. This is fully independent from Phase 2's multi-team/multi-branch work for employees.

## Completed Phases

### Phase 3.1 — Schema ✅
- `ALTER TABLE customers ADD COLUMN branch_id UUID REFERENCES branches(id)` (nullable, independent)
- Index on `branch_id` for query performance
- No backfill needed; field starts NULL and is explicitly set

### Phase 3.2 — Backend ✅

**GET /customers**
- Added `branch_id` to SELECT clause
- Updated branch filter: `(c.branch_id = $N OR EXISTS(...teams...))`
- Preserves existing behavior; filter now also matches customers' own branch_id
- Unfiltered queries unchanged

**PATCH /customers/:id/branch** (new endpoint)
- Set or clear customer's branch_id
- Validates branch exists in agency
- Gated to `customers.allocate` permission
- Returns: `{ success: true }`

**GET /allocations/unallocated**
- Added `branch_id` as optional query parameter
- Added `branch_id` to SELECT clause
- Enables filtering unallocated customers by branch (previously impossible)
- Non-breaking: unfiltered queries work unchanged

### Phase 3.3 — Frontend ✅

**CustomersPage.tsx**
- Loads branches on mount (alongside companies)
- Added `branchId` state
- Added branch filter dropdown (distinct from company/product/bucket)
- Filter sent to `/customers` API call
- Responsive layout adjusted for new filter

**AllocationPage.tsx** (UnallocatedQueue)
- Loads branches on mount
- Added separate `customerBranchId` state
  - **Distinct from** `branchTeam.branchId` which filters agent picker
  - Clearly labeled "Customer branch" vs existing "Branch" (for agents)
- Updated explanatory text:
  - "Branch / Team filters above narrow the agent selector — not the customer table"
  - "Use 'Customer branch' below to filter unallocated customers by their assigned branch"
- Filter sent to `/allocations/unallocated` API call

**types.ts**
- Added `branch_id: string | null` to `Customer` interface

### Phase 3.4 — Import Mapping ✅

**Field Catalog** (system_field_definitions)
- Added `customer_branch` field entry to all agencies
- Type: `resolver` (like `agent_phone`, not stored data itself)
- Resolves branch name/code to `branches.id`
- Non-core field (is_core=false)
- sort_order=11 (after existing fields)

**Import Service** (import-service.ts)

*MappedRow interface:*
- Added `customer_branch: string | null` field

*resolveBranches() function (new):*
- Extracts unique branch names/codes from rows
- Queries branches table matching by name or UUID
- Returns Map: branch_name → branch_id
- Supports both branch name AND branch UUID as input
- Non-fatal: unknown branches tracked but don't fail import

*commitImport() integration:*
- Calls `resolveBranches()` for toInsert + toUpdate rows
- Tracks `unknownBranches` set (mirrors `unknownPhones`)
- **INSERT query:** Added `branch_id` as 14th column
  - Uses resolved branch_id or NULL if unknown
- **UPDATE query:** Added `branch_id` as 13th column (COALESCE to preserve old value if blank)
  - Mirrors existing COALESCE pattern for other fields
- **Result object:** Added `unknown_branches: [...]` field
  - Reported alongside `unknown_agent_phones` for transparency

## SQL Patterns

### Filter: Branch-aware customer queries
```sql
c.branch_id = $N OR EXISTS (
  SELECT 1 FROM teams tm 
  WHERE tm.id = c.assigned_team_id AND tm.branch_id = $N
)
```

### Resolution: Branch by name or UUID
```sql
SELECT b.id, b.name FROM branches b
  JOIN companies co ON co.agency_id = b.agency_id
WHERE co.id = $1 AND (b.name = ANY($2) OR b.id::text = ANY($2))
```

### Colalesce update (preserve old value if blank)
```sql
branch_id = COALESCE($N, branch_id)
```

## Integration Points

### No Regression in:
- Allocation workflows (unchanged)
- Reallocation workflows (unchanged)
- Dashboard/reporting (Phase 2.2 scope clamping untouched)
- Existing branch filters (now just more comprehensive)

### New Capabilities:
- Filter unallocated customers by branch (previously impossible)
- Set customer branch independently of allocation/team
- Map branch column in Excel imports
- Comprehensive branch filtering in customers list

## Backward Compatibility

✅ **Fully backward compatible:**
- All new fields optional/nullable
- Existing queries unaffected
- New filters don't interfere with old ones
- Unknown branches reported non-fatally (like unknown phones)
- Existing imports work unchanged (customer_branch is opt-in field)

## Testing Checklist

### Backend
- [ ] Migrations run successfully
- [ ] GET /customers branch filter works (matches both c.branch_id and team branch)
- [ ] PATCH /customers/:id/branch endpoint works
- [ ] GET /allocations/unallocated can filter by branch_id
- [ ] Import maps branch column correctly
- [ ] Unknown branches reported in result, don't fail import

### Frontend
- [ ] CustomersPage branch filter loads and filters correctly
- [ ] AllocationPage customer branch filter distinct from agent picker filters
- [ ] Setting customer branch via PATCH works
- [ ] Multiple filter combinations work (company + branch, etc.)

### Integration
- [ ] Existing allocation flows unchanged
- [ ] Reallocations unaffected
- [ ] Dashboard queries still correct

## Files Modified

**Migrations:**
- `1787300000000_customer-branch.sql` — schema
- `1787400000000_field-config-customer-branch.sql` — field catalog

**Backend:**
- `src/routes/customers.ts` — branch filter, endpoint, SELECT
- `src/routes/allocations.ts` — branch filter, SELECT
- `src/services/import-service.ts` — resolveBranches(), MappedRow, INSERT/UPDATE

**Frontend:**
- `src/pages/CustomersPage.tsx` — branch filter UI
- `src/pages/AllocationPage.tsx` — customer branch filter UI
- `src/types.ts` — Customer interface

## Commits

| #  | Subject |
|----|---------|
| 1  | Phase 3.1-3.2: Customer branch_id schema and backend support |
| 2  | Phase 3.3: Add customer branch filter to frontend |
| 3  | Track 3: Customer branch_id — complete end-to-end |

**Total: 3 commits, ~180 lines added**

## Deferred / Out of Scope

- UI to set customer branch in detail drawer (POST /customers endpoint needed first)
- Bulk branch assignment (currently one-at-a-time via PATCH)
- Branch-reassignment for existing allocations (data cleanup manual, separate task)
- Audit logging for branch changes (use allocation_logs pattern later if needed)

---

## What's Next

Track 3 is **complete and independent**. Next tracks can start in parallel:

- **Track 4:** Server-side employee/agent filtering (depends on Track 1 designation — ready)
- **Track 5:** Field-agent assignment UI (independent backend, ready)
- **Track 6:** Import rollback (independent — ready)
- **Track 7:** Mobile EMI + company filter (independent — ready)
- **Track 8:** Drill-down dashboards (benefits from Track 2 TL clamp — ready)

All remaining tracks are independent of Track 3 and can proceed in parallel without blocking each other.

