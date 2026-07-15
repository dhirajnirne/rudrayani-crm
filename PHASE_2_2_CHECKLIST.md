# Phase 2.2 — Scope Clamping Rewrite (Detailed Checklist)

## Current Status

- ✅ Made `resolveReportScope()` async
- ✅ Added query against `team_leaders` table to fetch TL's led teams
- ✅ Updated `ResolvedScope` interface with `scopeTeamIds?: string[] | null`
- ✅ Added new `"teams"` value to `clampedTo` union
- ❌ NOT YET: Updated call sites to `await` and handle `scopeTeamIds`

## Call Sites to Update (within `report-service.ts`)

All of these call `resolveReportScope()` and must be made async/await:

1. `dashboard()` function — LINE ~?
   - Calls `resolveReportScope()` to get scope
   - Extracts `scope.filters` and uses `filters.team_id` in WHERE condition
   - **ACTION**: 
     - Change function to `async`
     - Add `await` to `resolveReportScope()` call
     - Check if `scope.scopeTeamIds` exists
     - If yes: use `team_id = ANY($param)` in conditions, push array to params
     - If no: use `team_id = $param` as before

2. `agentBreakdown()` function — LINE ~?
   - Same pattern as dashboard()

3. `dimensionBreakdown()` function — LINE ~?
   - Same pattern, but more complex because it groups by dimension
   - If `dimension = 'team'` and TL is viewing aggregated data (scopeTeamIds set), special handling needed

4. `depositsRange()` function — LINE ~?
   - Check if used by TL reports
   - Same await/scopeTeamIds pattern

5. `trail()` function — LINE ~?
   - Same pattern

6. `trend()` function — LINE ~?
   - Same pattern

## Query Builder Helper Pattern

For each function, the pattern should be:

```typescript
const scope = await resolveReportScope(user, requested, hasFullView);
const { filters, scopeTeamIds } = scope;

// Build WHERE conditions
const teamCondition = scopeTeamIds 
  ? `team_id = ANY($${params.length + 1})` 
  : filters.team_id 
    ? `team_id = $${params.length + 1}` 
    : null;

if (scopeTeamIds) {
  params.push(scopeTeamIds);
} else if (filters.team_id) {
  params.push(filters.team_id);
}
```

Or create a helper function to avoid duplication:

```typescript
function buildTeamClause(scope: ResolvedScope, params: unknown[]): string | null {
  if (scope.scopeTeamIds?.length) {
    params.push(scope.scopeTeamIds);
    return `team_id = ANY($${params.length})`;
  } else if (scope.filters.team_id) {
    params.push(scope.filters.team_id);
    return `team_id = $${params.length}`;
  }
  return null;
}
```

## Routes that Call report-service Functions

These need to be checked to ensure they're not making assumptions about scope:

- `GET /reports/dashboard` → calls `dashboard()`
- `GET /reports/overview` → calls `overview()` (if it exists)
- `GET /reports/agents` → calls `agentBreakdown()`
- `GET /reports/breakdown?dimension=X` → calls `dimensionBreakdown()`
- `GET /reports/deposits-range` → calls `depositsRange()`
- `GET /reports/trail` → calls `trail()`
- `GET /reports/trend` → calls `trend()`

**Action**: Check `routes/reports.ts` to ensure it just calls the service functions and returns results; all scoping should be in the service layer.

## Test Cases to Add

1. **Single-team TL baseline**
   - TL with one team in `team_leaders`
   - Query `/reports/dashboard` (no team_id)
   - Verify results are identical to old behavior (single team)
   - Verify results same as querying with explicit `?team_id=<their-team>`

2. **Multi-team TL aggregation**
   - TL with 3 teams in `team_leaders`
   - Query `/reports/dashboard` (no team_id)
   - Verify numbers are SUM across all 3 teams (not just first, not error)

3. **Multi-team TL specific team request**
   - Query `/reports/dashboard?team_id=<one-of-their-teams>`
   - Verify restricted to that specific team

4. **Multi-team TL requesting other team**
   - Query `/reports/dashboard?team_id=<not-their-team>`
   - Verify 403 Forbidden error

5. **Operations Manager unaffected**
   - Admin/OM queries should still work exactly as before (clampedTo="agency", no team restriction)

6. **Agent-level self-view unaffected**
   - Telecaller/Field Agent self-view should still work exactly as before

## scope.ts Changes Needed

There's also `scopeFilter()` in `scope.ts` used by attendance/tracking domain.

**ACTION**: Repeat the same pattern there:
- Make `scopeFilter()` async
- Query `team_leaders` for multi-team TLs
- Update call sites in `tracking.ts`, `day-plan.ts`, `attendance-records.ts`

## Risk Mitigation

1. **Make changes in small commits** — one function at a time, not all at once
2. **Run tests after each** — ensure nothing breaks incrementally
3. **Add console logging** — temporary debug logging to verify scopeTeamIds is computed correctly
4. **Pair with regression test** — ensure single-team TL behavior unchanged
5. **Explicitly verify reallocation untouched** — run full reallocation test suite at the end

## Implementation Order

1. Create helper functions for team clause building
2. Update `dashboard()` function (simplest, foundational)
3. Update `agentBreakdown()` 
4. Update `dimensionBreakdown()` (most complex, do last)
5. Update remaining functions (depositsRange, trail, trend)
6. Update `scope.ts` and its call sites
7. Add/update tests
8. Run full regression suite
