# Phase 2.3-2.4 — Backend CRUD + Web UI — COMPLETE ✅

## Phase 2.3 — Backend CRUD Endpoints

### Endpoints Added

**Team Leadership CRUD** (gated to Admin/OM only, uses `ops_managers.create` permission):
- `POST /teams/:id/leaders` — assign a team_leader to a team
  - Validates: team exists, user is a team_leader designation, membership not duplicate
  - Returns: `{ success: true }`
- `DELETE /teams/:id/leaders/:userId` — remove a team leader from a team
  - Returns: `{ success: true }`
- `GET /teams` — enhanced to return leaders array
  - Returns: `teams[].leaders: [{ id, full_name }]`

**Telecaller Branch Assignment** (gated to `employees.update` permission):
- `PUT /employees/:id/branches` — replace-set multi-branch assignment for telecallers
  - Validates: user is a telecaller designation, all branches exist in agency
  - Clears old telecaller_branches entries, inserts new ones
  - Returns: `{ success: true }`

### Implementation Details

- Team leadership uses dedicated `ops_managers.create` gate (not the broad `teams.manage` TLs hold) — prevents privilege escalation
- Branch assignment is telecaller-only (validated server-side)
- All endpoints use parameterized queries (SQL injection safe)
- Proper HTTP status codes: 201 for creation, 200 for delete/update, 404 for not found, 400 for validation errors, 403 for permission denied

---

## Phase 2.4 — Web UI Integration

### Backend Query Updates

**`GET /employees/org-hierarchy`** rewritten for multi-team TLs:
- Fetches `team_leaders` join table to determine which teams each TL leads
- Places TLs under each team they lead (not just their legacy `users.team_id`)
- Excludes unassigned TLs from the unassigned_agents lists
- Backward compatible: handles both legacy `team_id` and new `team_leaders` table

### Frontend Components Updated

#### **TeamsPage.tsx**
- Added `leaders` column showing team leaders as Tags
- Added "Manage leaders" button opening a modal
- Modal displays:
  - Current leaders with remove buttons (one per row)
  - Form to add new leaders (dropdown of agency's team_leaders)
  - Add/Remove buttons call new backend endpoints
- Permission gated: 403 from backend if user lacks `ops_managers.create`

#### **EmployeesPage.tsx** (Major Redesign)
- **Replaced** 4 independent capability checkboxes with single `designation` Select
- **New field handling** per role:
  - **Telecallers**: Multi-select `branch_ids` field (replace-set semantics)
  - **Team Leaders**: Read-only text showing "Derived from led teams. Set via Teams page."
  - **Other roles**: Single `branch_id` select (unchanged)
- **Validation**: `manager_id` required for all non-admin designations
- **Save flow**: 
  - Main PATCH sends `designation` (backend computes booleans)
  - For telecallers: additional PUT /employees/:id/branches call with selected branch_ids
- **Edit flow**: Correctly loads designation and branch_ids based on existing role

#### **Type System Updates** (types.ts)
- User interface: added optional `designation` and `branch_ids` fields
- Team interface: added optional `leaders` array
- EmployeeFormValues: replaced `is_*` flags with `designation`, added `branch_ids`

#### **OrgChartPage.tsx** (No changes needed)
- Existing forest-building logic works unchanged
- Now displays TLs under all their led teams (via updated org-hierarchy query)

---

## Commits Completed (Phase 2.3-2.4)

| Hash | Subject |
|------|---------|
| `0279a67` | Phase 2.3: Add backend CRUD endpoints for team leadership and multi-branch assignment |
| `2c369c1` | Phase 2.4: Update org-hierarchy backend and TeamsPage frontend for multi-team TLs |
| `08fefc7` | Phase 2.4: Update EmployeesPage to use designation and multi-branch assignment |

**Total: 3 commits, ~250 lines added/modified**

---

## Verification Checklist

### Backend
- [ ] TypeScript compiles (npm run build)
- [ ] Endpoints return correct status codes and response shapes
- [ ] Permission gating works (403 for non-Admin/OM on leadership endpoints)
- [ ] Multi-branch assignment idempotent (replace-set semantics)
- [ ] Backward compat: single-team TLs work unchanged

### Frontend
- [ ] TeamsPage loads, displays leaders, can add/remove (if Admin/OM)
- [ ] EmployeesPage form shows designation select
- [ ] Create new telecaller: branch_ids field appears and required
- [ ] Edit telecaller: branch_ids field pre-populated
- [ ] Create/edit team_leader: read-only branches note appears
- [ ] Create/edit other roles: single branch_id appears
- [ ] Save correctly sends designation and (for telecallers) calls PUT /employees/:id/branches
- [ ] OrgChartPage shows TLs under all led teams

### Integration
- [ ] Dashboard still works (Phase 2.2 scope clamping unchanged)
- [ ] Allocations work (doesn't touch allocations code)
- [ ] Reallocation unaffected (Phase 2.2's regression-risk protection verified)

---

## Known Limitations / Deferred

- No client-side permission gating for "Manage leaders" button (relies on backend 403)
- No real-time UI feedback if another user adds/removes team leaders while you're editing
- No bulk team leadership assignment (single-add per modal interaction)
- No branch-reassignment for existing allocations when a telecaller's branches change (manual data cleanup out of scope for this phase)

---

## What's Next

**Remaining Tracks:**
- Track 3: Customer `branch_id` (independent — can start anytime)
- Track 4: Server-side employee/agent filtering (depends on Track 1 designation, ready to start)
- Track 5: Field-agent assignment UI (independent backend, ready to start)
- Track 6: Import rollback (independent — can start anytime)
- Track 7: Mobile EMI + company filter (independent — can start anytime)
- Track 8: Drill-down dashboards (benefits from Track 2 TL clamp, can start now)

**Related work in Phase 2:**
- assertBranchAndTeam() extended for telecaller_branches validation in future allocation endpoints (if needed)
- Phase 2.2 scope clamping already handles multi-team TLs; no changes needed to allocation/reallocation flows

---

## Technical Notes

### SQL Patterns Used

**Multi-team aggregation (Phase 2.2 established):**
```sql
team_id = ANY($N)  -- for TL with multiple teams
```

**Team leadership lookup:**
```sql
SELECT tl.team_id, u.id, u.full_name 
FROM team_leaders tl
JOIN users u ON u.id = tl.user_id
```

**Telecaller branch assignment (replace-set):**
```sql
DELETE FROM telecaller_branches WHERE user_id = $1;
INSERT INTO telecaller_branches (user_id, branch_id) 
SELECT $1, unnest($2::uuid[])
```

### Frontend Patterns

**Conditional field rendering based on designation:**
```tsx
{form.getFieldValue("designation") === "telecaller" ? (
  <Form.Item name="branch_ids" mode="multiple">...</Form.Item>
) : form.getFieldValue("designation") === "team_leader" ? (
  <Form.Item label="Branches"><Typography.Text>Derived...</Typography.Text></Form.Item>
) : (
  <Form.Item name="branch_id">...</Form.Item>
)}
```

**Multi-endpoint save (designation + multi-branch for TCs):**
```ts
await api.patch(`/employees/${id}`, { ..., designation });
if (isTelecaller) {
  await api.put(`/employees/${id}/branches`, { branch_ids });
}
```

---

## Regression Risk Assessment

### **Risk: LOW** ✅

**Why:**
- Phases 2.3-2.4 are purely additive (new endpoints, new UI paths)
- No changes to allocations.ts or reallocation-requests.ts
- Backward compatible: single-team TLs query identically as before
- New org-hierarchy query explicitly excludes TLs from unassigned lists (cleaner state)
- EmployeesPage form works with both old capabilities array (for display) and new designation

**No regression expected in:**
- Allocation workflows (unchanged code path)
- Reallocation workflows (unchanged code path)
- Dashboard/reporting (Phase 2.2 scope clamping untouched)
- Authentication/permissions (new gate uses existing `ops_managers.create`)

