# Phase 2.2 — Key Technical Challenge & Decision Point

## What We've Done

✅ Made `resolveReportScope()` async and able to query `team_leaders` table
✅ Implemented multi-team TL aggregation logic (when no specific team requested)
✅ Added `scopeTeamIds` field to ResolvedScope interface
✅ Created `buildTeamClause()` helper for building WHERE conditions

## The Challenge

The problem: How do we thread `scopeTeamIds` through to the actual SQL queries?

### The Architecture

```
dashboard() function
  ↓
  calls classify(filters) 
    ↓
    calls baseConditions(filters)
      ↓
      returns: [ "s.company_id = $1", "s.assigned_team_id = $2", ... ]
  ↓
  calls depositTotals(filters)
    ↓
    calls baseConditions(filters)
      ↓
      returns: [ "s.company_id = $1", "s.assigned_team_id = $2", ... ]
  ↓
  calls resolveTarget(filters)  
    ↓
    builds custom WHERE...
```

The issue: `baseConditions()` takes `filters` only, and builds the team condition as `s.assigned_team_id = $N` (single value). It doesn't know about `scopeTeamIds`.

### Scenario: Multi-team TL queries `/reports/dashboard` (no specific team)

**Current flow:**
1. `resolveReportScope()` returns:
   - `filters.team_id = undefined` (no specific team requested)
   - `scopeTeamIds = ['team-a', 'team-b', 'team-c']`
2. Dashboard calls `classify(filters)` 
3. Classify calls `baseConditions(filters)`
4. baseConditions returns empty array for team condition (since filters.team_id is undefined)
5. Query runs: `WHERE s.company_id = $1` (NO TEAM RESTRICTION!)
6. TL sees agency-wide data instead of just their 3 teams ❌

**What we need:**
```sql
WHERE s.company_id = $1 AND s.assigned_team_id = ANY($2)
-- where $2 = ['team-a', 'team-b', 'team-c']
```

## Two Implementation Approaches

### Option A: Modify baseConditions() to accept scope

**Pros:**
- Cleaner architecture
- Single place to handle multi-team logic
- Less code duplication

**Cons:**
- `baseConditions()` is called from 15+ places
- Every caller would need to be updated to pass scope
- Higher ripple effect = higher regression risk
- More invasive change

**Estimated work:** ~20 function edits, higher risk

### Option B: Build WHERE conditions manually when scopeTeamIds present

**Pros:**
- Surgical change
- Only affects functions that need multi-team (dashboard, agentBreakdown, etc)
- Easier to review and test in isolation
- Lower ripple effect

**Cons:**
- Some code duplication
- Each function builds its own conditions
- Less elegant architecturally

**Pattern for Option B:**
```typescript
const scope = await resolveReportScope(...);

// Build params and conditions separately
const params: unknown[] = [agencyId, filters.month];
const conditions: string[] = [];

// Company filter
if (filters.company_id) {
  params.push(filters.company_id);
  conditions.push(`s.company_id = $${params.length}`);
}

// Team filter — handles BOTH single team and multi-team
const teamClause = buildTeamClause(scope, params);
if (teamClause) conditions.push(teamClause);

// Other filters
if (filters.product) { /* ... */ }
if (filters.bucket) { /* ... */ }

// Build query
const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
```

**Estimated work:** ~6 functions, each with clear, testable pattern

## Recommendation

**Option B** is the safer choice for this round because:

1. **Regression risk**: Given the brief's explicit flag that reallocation/dual-allocation are at risk, we want minimal ripple effects. Option B touches only the functions we absolutely need to change.

2. **Testability**: Each function can be tested independently. We can test dashboard's multi-team logic without worrying that we broke something in 15 other callers.

3. **Rollback safety**: If we discover an issue with multi-team TLs, the changes are localized and easier to fix.

4. **Code review**: Easier to review small, focused changes to 6 functions than large refactor of baseConditions().

## Implementation Plan for Option B

1. Identify all functions that query customer_month_snapshots:
   - `dashboard()` 
   - `agentBreakdown()`
   - `dimensionBreakdown()`
   - `classify()` (but this is internal helper)
   - `depositTotals()`
   - `bookTotals()`
   - `collectedToday()`
   - `collectionByType()`
   - `collectionByChannel()`

2. For each, update to:
   - Accept `scope: ResolvedScope` parameter
   - Build conditions manually using buildTeamClause()
   - Ensure `await resolveReportScope()` is called by top-level function

3. Add test cases for:
   - Single-team TL (baseline, should match pre-Phase-2.2 exactly)
   - Multi-team TL with no team_id specified (aggregates across all)
   - Multi-team TL with specific team_id (shows only that team)
   - Multi-team TL requesting outside team (403)
   - Admin/OM still unrestricted

4. Run full test suite before merging

## Next Steps

**If you choose Option B:**
1. Start with dashboard() function
2. Make it build conditions manually with buildTeamClause()
3. Test it thoroughly (single-team baseline, multi-team aggregation)
4. Move to next function (agentBreakdown())
5. Build momentum with each success

**If you choose Option A:**
1. Refactor baseConditions() to accept scope
2. Update all 15+ callers
3. Comprehensive test suite
4. Higher risk but cleaner end result

Which approach would you prefer?
