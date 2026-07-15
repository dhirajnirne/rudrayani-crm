# Round 2 Feedback Implementation Status

## ✅ Completed

### Track 1 — Designation (Phases 1.1-1.3)
- **Phase 1.1**: Schema migration (`1787100000000_user-designation.sql`)
  - Added `users.designation TEXT` column
  - Backfill from existing capability flags using precedence: admin > OM > TL > Telecaller > Field Agent
  - Added CHECK constraint, NOT NULL enforcement, and index
  
- **Phase 1.2**: Backend wiring
  - Added `booleansForDesignation()` helper to compute boolean flags from single designation
  - Updated `UserRow` interface to include `designation` field
  - Updated `publicUser()` to return designation alongside capabilities (backward compat)
  - Replaced `capabilities` object schema with `designationSchema` in POST/PATCH `/employees`
  - Updated both create and update handlers to accept `designation` and compute all boolean flags from it
  
- **Phase 1.3**: Hard hierarchy enforcement
  - Rewrote `assertManager()` to enforce strict rank chain:
    - `operations_manager` → manager must be `agency_admin`
    - `team_leader` → manager must be `operations_manager`
    - `telecaller`/`field_agent` → manager must be `team_leader`
    - `agency_admin` → no manager allowed
  - Non-admins MUST have a manager
  - Forward-only validation (only when designation/manager_id changes, not every edit)
  - Updated seed scripts (`seed_admin.ts`, `seed_demo.ts`) to use designation

### Track 2 — Multi-Branch/Multi-Team (Phases 2.1-2.2, partial)
- **Phase 2.1**: Schema
  - Created `telecaller_branches(user_id, branch_id)` join table
  - Created `team_leaders(user_id, team_id)` join table  
  - Backfilled existing assignments from current `users.branch_id`/`users.team_id` for backward compat
  
- **Phase 2.2**: Scope clamping (PARTIAL - HIGH REGRESSION RISK)
  - Made `resolveReportScope()` async
  - Updated to query `team_leaders` table to fetch TLs' led teams
  - Added support for multi-team TL aggregation when no specific team requested
  - Added new `scopeTeamIds` field to `ResolvedScope` interface
  - Added new `"teams"` value to `clampedTo` union type

## ⚠️ In Progress / Needs Completion

### Track 2 — Multi-Branch/Multi-Team (Phases 2.2-2.4, remaining)
**Critical regression-risk area** — flagged explicitly in the plan:

1. **Phase 2.2 continuation** (HIGH PRIORITY):
   - Find all call sites of `resolveReportScope()` (in routes/*.ts) and make them `await` the async call
   - Estimated: ~6 endpoints across `reports.ts`, `dashboard.ts`, etc.
   - Update each to handle the new optional `scopeTeamIds` field in the returned scope
   - Update `scope.ts` `scopeFilter()` similarly for attendance/tracking domain
   - **Must add comprehensive regression tests** proving:
     - Single-team TLs still work exactly as before (backward compat baseline)
     - Multi-team TLs see correct aggregated data across all led teams
     - Specific team_id requests validate against the TL's led set
     - Reallocation and dual-allocation flows unaffected (these don't call resolveReportScope)

2. **Phase 2.3**: Backend CRUD endpoints
   - `POST/DELETE /teams/:id/leaders` (gated by Admin/OM only, not broad `teams.manage`)
   - `GET /teams` enhanced to return `leaders` array
   - `PUT /employees/:id/branches` for multi-branch telecaller assignment
   - Update `assertBranchAndTeam()` to check `telecaller_branches` table for telecallers

3. **Phase 2.4**: Web UI
   - Update `TeamsPage.tsx` with leader column and add/remove control
   - Update `EmployeesPage.tsx` form: 
     - Single-select designation (done backend, UI needed)
     - Multi-select branches for telecallers
     - Read-only derived branches for team leaders
   - Update `OrgChartPage.tsx` tree-building to use `team_leaders` table
   - Update backend `org-hierarchy` query to join `team_leaders` instead of `users.team_id`

### Track 1 — Designation (Phases 1.4-1.5, remaining)
1. **Phase 1.4**: Web UI
   - Replace 4 independent capability checkboxes with single designation radio/select
   - Rewrite "Reports to" dropdown to show only valid next-rank-up candidates and display `"{name} — {designation}"`
   - Update `Employee` type to include `designation` field

2. **Phase 1.5**: Org chart
   - Render `designation` tags in org chart (currently renders capability tags)

### Track 3 — Customer Branch Field (Phases 3.1-3.4)
1. **Phase 3.1**: Schema
   - `ALTER TABLE customers ADD COLUMN branch_id UUID REFERENCES branches(id)`

2. **Phase 3.2**: Backend
   - Update `customers.ts` GET `/` to include `branch_id` in SELECT
   - Rewrite branch filter to `(c.branch_id = $N OR EXISTS(...teams...))` for unallocated support
   - Update `allocations.ts` `/unallocated` to accept `branch_id` param

3. **Phase 3.3**: Frontend
   - Add branch filter to `CustomersPage.tsx`
   - Add distinct "Customer branch" filter to `AllocationPage.tsx` unallocated queue

4. **Phase 3.4**: Import mapping
   - Add field-catalog entry for branch resolution (name → `branches.id`)
   - Wire into `commitImport()` insert/update loops

### Track 4 — Server-Side Filtering (Phases 4.1-4.2)
- Make capability filtering server-side in `GET /employees` (was client-only)
- Add `customer_branch_id` and `product` filters via EXISTS subqueries
- Wire into `EmployeesPage.tsx` and `AllocationPage.tsx` agent picker

### Track 5 — Field-Agent Assignment UI (Phase 5.1)
- Add "Assign field agent" action to `AllocationPage.tsx` alongside telecaller assignment
- Add column for `assigned_field_agent_name` to allocated customers list
- Wire up the existing `POST /allocations/assign-field-agent` endpoint

### Track 6 — Import Rollback (Phases 6.1-6.5, extended scope)
- **Phase 6.1-6.2**: Schema + first-of-month direct-apply backups (low complexity)
- **Phase 6.3**: EXTENDED to cover repeat/refresh allocation-mode imports
  - Backup mechanism for review-approval changes (4 categories: additions, updates, reactivations, removals)
  - Each category needs its own reversal semantics
  - Capture "before" state inside `import-reviews.ts` handlers
- **Phase 6.4**: Rollback endpoint `POST /imports/runs/:id/rollback` with safety checks
- **Phase 6.5**: Frontend UI to trigger rollback with blocked-customer reporting

### Track 7 — Mobile Fixes (Phases 7.1-7.2)
- Show EMI amount on worklist card and history timeline
- Client-side company filter on worklist (dropdown from loaded list, no backend change)
- Punch in/out: NO CHANGES (confirmed already works for all roles)

### Track 8 — Drill-Down Dashboard (Phases 8.1-8.2)
- New web page alongside (not replacing) `ManagementDashboardPage.tsx`
- Click-through drill: agency → branch/OM → team → agent, using existing `/reports/breakdown`, `/reports/agents`
- Date controls: day/week/month presets + custom range
- Mobile equivalent screen(s) with push-per-level navigation

## 🚨 Known Risks & Notes

1. **Reallocation & dual-allocation UNTOUCHED**: 
   - `allocations.ts` and `reallocation-requests.ts` do NOT call `resolveReportScope` or `scopeFilter`
   - These flows should NOT be affected by Track 2.2 scope changes
   - **Must verify existing reallocation + dual-assignment test suites pass unmodified**

2. **Forward-only hierarchy enforcement**:
   - Existing invalid manager chains (found in Phase 1.0 audit) are NOT retroactively fixed
   - New validation only applies to writes that include designation or manager_id
   - Follow-up: admin-facing "hierarchy violations" report/repair tool (out of scope this round)

3. **Backward compatibility**:
   - `capabilities` array still returned by `publicUser()` alongside new `designation`
   - Existing routes/clients reading `capabilities` keep working
   - Old `users.branch_id`/`users.team_id` columns remain populated for transition period
   - New M2M tables (`team_leaders`, `telecaller_branches`) coexist with old scalar columns

4. **Test coverage**:
   - Biggest test-churn point: any fixture posting `capabilities: {...}` to POST/PATCH `/employees` needs updating (now expects `designation` string)
   - Regression tests MUST cover:
     - Single-team TL baseline (unchanged behavior)
     - Multi-team TL aggregation
     - Reallocation flows (no regression)
     - Dual-allocation (no cross-slot clearing)

## Next Steps

**Highest priority** (enables everything else):
1. Complete Track 2.2 scope rewriting (async calls, scopeTeamIds threading)
2. Add regression tests for reallocation/dual-allocation
3. Complete Track 1.4 web UI (designation selector, Reports To dropdown)
4. Complete Track 3.1-3.2 (customer branch_id schema + backend)

**Secondary** (can run in parallel after above):
- Track 2.3-2.4 (leadership/branch CRUD + UI)
- Track 4 (server-side employee filtering)
- Track 5 (field-agent assignment UI)
- Tracks 6-8 (import rollback, mobile, dashboards)

## Files Modified

- `backend/migrations/1787100000000_user-designation.sql` (NEW)
- `backend/migrations/1787200000000_multi-branch-multi-team.sql` (NEW)
- `backend/src/types/user.ts` (designation field, booleansForDesignation helper)
- `backend/src/routes/employees.ts` (schema, assertManager rewrite, create/patch handlers)
- `backend/src/services/report-service.ts` (async resolveReportScope, team_leaders query)
- `backend/src/migrations/seed_admin.ts` (designation usage)
- `backend/src/migrations/seed_demo.ts` (designation usage)

## Commits

1. `401d60d` — Phase 1.1-1.2: Add designation column and wire into employees routes
2. `9ced74b` — Phase 1.3: Hard hierarchy enforcement + update seed scripts
3. `14720ad` — Phase 2.1-2.2 (partial): Schema for multi-branch/multi-team + scope rewrite start
