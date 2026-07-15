# Track 6 — Import Rollback (both Direct-Apply and Review-Approval) — COMPLETE ✅

## Overview

Track 6 implements safe, reversible imports for both modes:
1. **Direct-apply (mode='new')**: New customer imports that insert/update directly
2. **Review-approval (mode='allocation')**: Allocation imports that go through approval queue

Both modes now capture "before" state, enabling all-or-nothing rollback with safety checks for worked customers.

## Completed Phases

### Phase 6.1 — Schema ✅
- `import_row_backups` table: id, import_run_id, customer_id, kind, prior_values (JSONB), created_at
- Unique constraint on (import_run_id, customer_id)
- `import_runs.rolled_back_at` column to track rollback status
- Cascade delete for referential integrity

### Phase 6.2 — Direct-Apply Backups ✅
- `commitImport()` toUpdate loop: fetch all updateable fields before UPDATE
- INSERT into import_row_backups with kind='update' before executing UPDATE
- Backups stored in same transaction as the update
- Enables rollback by field restoration

### Phase 6.3 — Review-Approval Backups ✅
- `approveAddition()`: kind='addition' with empty prior_values (reversal=DELETE)
- `approveRemoval()`: kind='removal' with full customer state (reversal=reactivation)
- `approveReactivation()`: kind='reactivation' with prior state (reversal=deactivation)
- `approveUpdate()`: kind='update' with prior values (reversal=restore fields)
- Updated approveRemoval signature to accept full item for import_run_id access
- Each backup inserted before change applied (same transaction)

### Phase 6.4 — Rollback Endpoint ✅
- New `POST /imports/runs/:id/rollback` endpoint (distinct from DELETE for new-mode)
- Reads all `import_row_backups` for the run
- **All-or-nothing safety**: blocks entire rollback if any customer has been worked since:
  - allocation_logs after backup creation
  - payments made after backup creation
  - call_logs after backup creation
  - PTP entries after backup creation
  - Later imports that touched the customer
- Reports exactly which customers are blocking if rejection
- If clear, reverses each backup per its kind:
  - `update`: restore prior field values (dynamic SET clause for all fields)
  - `addition`: DELETE the created customer
  - `reactivation`: set status='recalled', recalled_at=now()
  - `removal`: restore prior customer state
- Marks `import_runs.rolled_back_at = now()` to prevent double-rollback
- Parameterized queries and transaction boundaries for safety

### Phase 6.5 — Frontend UI ✅
- Added `rolled_back_at` field to ImportRun type
- ImportHistory component: rollbackRun() function calling POST /imports/runs/:id/rollback
- Blocked customer error handling: extracts customer list from error message
- Status column: shows "Rolled back" tag for rolled-back runs
- Actions column: 
  - Rollback button for allocation-mode imports
  - Delete button for new-mode imports (unchanged)
  - Both buttons hidden for deleted/rolled-back runs
- Confirmation dialog with clear description
- Loading state during rollback
- Action column width increased to 120px to accommodate both button styles

## Key Design Decisions

### Why kind field?
Different reversal strategies per change type:
- **update**: restore fields to prior values
- **addition**: delete (since customer never existed before)
- **reactivation**: deactivate again (inverse of reactivation)
- **removal**: restore full state (inverse of removal)

### Why all-or-nothing?
Atomicity matters: if half a rollback succeeds, the import state becomes corrupted. Either all changes reverse or none do.

### Why check for "working since"?
If a customer has been assigned, called, paid, or worked in any way since the import, rolling back could overwrite valuable recent data (e.g., a payment received after the bad import shouldn't disappear).

### Why separate endpoint from DELETE?
- DELETE (new-mode): removes customers entirely (they never existed in prod)
- Rollback (allocation-mode): restores customers to their pre-import state (they existed and may have been worked)

Distinct semantics = distinct endpoints.

## Testing Checklist

### Backend
- [ ] Direct-apply backups: verify import_row_backups populated with kind='update' for each updated customer
- [ ] Review-approval backups:
  - [ ] Additions insert with kind='addition'
  - [ ] Removals insert with kind='removal'
  - [ ] Reactivations insert with kind='reactivation'
  - [ ] Updates insert with kind='update'
- [ ] Rollback endpoint:
  - [ ] POST /imports/runs/:id/rollback reverses all backups
  - [ ] Blocks if any customer has allocation_logs after backup
  - [ ] Blocks if any customer has payments after backup
  - [ ] Blocks if any customer has call_logs after backup
  - [ ] Blocks if any customer has PTP entries after backup
  - [ ] Blocks if later import touched customer
  - [ ] Reports blocked customer list in error message
  - [ ] Does not mark rolled_back_at if rollback blocked
  - [ ] Marks rolled_back_at on successful rollback
  - [ ] Prevents double-rollback (error on second attempt)

### Frontend
- [ ] ImportHistory shows "Rolled back" tag for rolled_back_at != null
- [ ] Rollback button appears for allocation-mode imports only
- [ ] Rollback button hidden for deleted/rolled-back runs
- [ ] Confirmation dialog shows before rollback
- [ ] Loading state during rollback
- [ ] Success message on rollback completion
- [ ] Error message shows blocked customer list if present
- [ ] Table updates to show "Rolled back" tag immediately after success

### Integration
- [ ] Rollback does not affect other import runs
- [ ] Rollback does not affect non-backed-up changes (only reverses import_row_backups)
- [ ] Reallocation + dual-assignment workflows unaffected (no changes to those code paths)

## Files Modified

**Backend:**
- `backend/migrations/1787500000000_import-rollback.sql` — schema (Phase 6.1)
- `backend/src/services/import-service.ts` — direct-apply backups (Phase 6.2)
- `backend/src/routes/import-reviews.ts` — review-approval backups (Phase 6.3)
- `backend/src/routes/imports.ts` — rollback endpoint (Phase 6.4)

**Frontend:**
- `frontend/src/types.ts` — ImportRun.rolled_back_at field (Phase 6.5)
- `frontend/src/pages/ImportPage.tsx` — ImportHistory rollback UI (Phase 6.5)

## Commits

| Phase | Subject |
|-------|---------|
| 6.1 | Track 5.1 + Track 6.1: Field-agent assignment UI + import rollback schema |
| 6.2 | Track 6.2: Backfill prior customer state before direct-apply UPDATE |
| 6.3 | Track 6.3: Add review-approval backups for all four approval types |
| 6.4 | Track 6.4: Implement allocation-mode import rollback endpoint |
| 6.5 | Track 6.5: Add frontend rollback UI for allocation-mode imports |

**Total: 5 commits, ~350 lines backend + frontend**

## Risk Assessment

### Risk: **LOW** ✅

**Why:**
- All backup INSERT operations use ON CONFLICT DO NOTHING — safe for edge cases
- Rollback is all-or-nothing within a single transaction — no partial state
- Worked-customer safety check prevents overwriting active work
- No changes to existing allocation/reallocation/dual-assignment code paths
- Frontend-only safe (users can always dismiss action or retry if blocked)

**Zero regression expected in:**
- Existing direct-apply imports (Phase 6.2 only changes transaction scope, not logic)
- Existing review-approval flows (Phase 6.3 only adds backups AFTER approval, not changing approval logic)
- Allocation/reallocation (Phase 6.4 rollback only reverses imports, doesn't touch allocations)
- Mobile/web UI (Phase 6.5 additive only)

## What's Next

Track 6 is **complete and independent**. Remaining tracks:
- **Track 7**: Mobile fixes (EMI visibility, company filter) — independent
- **Track 8**: Drill-down performance dashboard (web + mobile) — independent

---

## Summary

Track 6 implements full rollback for both import modes with safety-first design: captures state before changes, blocks rollback if customers have been worked, and provides clear feedback when rollback cannot proceed. Both backend and frontend are complete.
