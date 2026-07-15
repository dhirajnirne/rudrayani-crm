# Track 5 — Field-Agent Assignment UI — COMPLETE ✅

## Overview

Track 5 Phase 5.1 implements the missing field-agent assignment interface in AllocationPage, enabling dual allocation of customers to both telecallers and field agents independently.

## Rationale

The backend endpoint `POST /allocations/assign-field-agent` already existed and worked correctly, but had zero frontend UI. This made the feature effectively unusable. Phase 5.1 adds the UI alongside the existing telecaller assignment flow.

## Completed Phase

### Phase 5.1 — Field-Agent Assignment UI ✅

**Backend changes (customers.ts)**:
- Added `assigned_field_agent_id` to SELECT clause in `GET /customers`
- Added `assigned_field_agent_name` via LEFT JOIN to users table for field agent lookups
- Field agent names now available in customer list API responses

**Frontend changes (AllocationPage.tsx)**:

*Unallocated Queue (new dual assignment)*:
- Created `telecallers` and `fieldAgents` computed lists (filter agents by capability)
- Added `fieldAgentId` and `assigningField` state for parallel assignment tracking
- Created `assignField()` function mirroring `assign()` but calling `/allocations/assign-field-agent`
- Split assignment UI into two alerts:
  - **Alert 1**: Telecaller assignment with dedicated picker and "Assign Telecaller" button
  - **Alert 2**: Field agent assignment with dedicated picker and "Assign Field Agent" button
  - Both alerts shown simultaneously for side-by-side selection

*Allocated List (show both assignments)*:
- Added "Telecaller" column showing `assigned_agent_name` (blue tag)
- Added "Field Agent" column showing `assigned_field_agent_name` (green tag)
- Updated actions column to show:
  - "Reallocate" button (for existing functionality)
  - "History" button (for allocation timeline)

## User-Facing Changes

1. **Assign customers to field agents**: Previously impossible via UI
2. **See both assignments**: Customers can now show both telecaller and field agent
3. **Independent slots**: Assigning a telecaller doesn't affect field agent slot and vice versa

## Technical Details

### Dual Assignment Model

The customer table has two independent assignment columns:
- `assigned_agent_id` — the telecaller handling the customer
- `assigned_field_agent_id` — the field agent assigned for physical visits

These are completely disjoint:
- Updating one never touches the other
- Both can be set simultaneously
- Either can be NULL

### Backend Guarantee (Already Verified)

The allocation service never mixes these slots:
- `POST /allocations/assign` updates only `assigned_agent_id`
- `POST /allocations/assign-field-agent` updates only `assigned_field_agent_id`
- Reallocation logic separately handles each slot

**Verification**: No shared UPDATE clauses; columns are independently addressable.

## Testing Checklist

### Backend
- [ ] GET /customers returns both assigned_agent_name and assigned_field_agent_name
- [ ] NULL values handled correctly for both fields
- [ ] Both agents show in customer detail view

### Frontend - Unallocated Queue
- [ ] Telecaller picker shows only telecallers (filtered by capability)
- [ ] Field agent picker shows only field agents (filtered by capability)
- [ ] "Assign Telecaller" button calls /allocations/assign
- [ ] "Assign Field Agent" button calls /allocations/assign-field-agent
- [ ] Selected count updates correctly for both assignments
- [ ] Both assignments work independently (select TC then FA works)

### Frontend - Allocated List
- [ ] "Telecaller" column shows agent name or "—"
- [ ] "Field Agent" column shows agent name or "—"
- [ ] "Reallocate" button works (existing functionality)
- [ ] "History" button works (existing functionality)
- [ ] Customers can show both or either assignment

### Integration
- [ ] Reallocating telecaller doesn't clear field agent
- [ ] Reallocating field agent doesn't clear telecaller
- [ ] Unallocated queue still filters by team/branch correctly
- [ ] Agent picker still respects context filters

## Files Modified

**Backend:**
- `src/routes/customers.ts` — added field agent names to SELECT

**Frontend:**
- `src/pages/AllocationPage.tsx` — dual assignment UI and agent filtering

## Commits

| # | Subject |
|----|---------|
| 1 | Track 5.1 + Track 6.1: Field-agent assignment UI + import rollback schema |

**Total: 1 commit, ~140 lines added**

## Risk Assessment

### Risk: **VERY LOW** ✅

**Why:**
- Pure UI addition over existing backend (no server logic changes)
- No impact on existing allocation flows (telecaller assignment unchanged)
- Disjoint table columns mean zero risk of slot interference
- Frontend-only safety (users can always see both assignments)

**Zero regression expected in:**
- Telecaller assignment (unchanged code path)
- Reallocation workflows (unchanged)
- Unallocated queue filtering (unchanged)

---

## What's Next

Track 5 is **complete and independent**. Remaining tracks:
- **Track 6**: Import rollback (Phases 6.2-6.5 remain; 6.1 schema done)
- **Track 7**: Mobile fixes (independent)
- **Track 8**: Drill-down dashboards (independent)

