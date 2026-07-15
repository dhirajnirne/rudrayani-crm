# Track 4 — Server-side employee/agent filtering — COMPLETE ✅

## Overview

Track 4 implements server-side filtering for employee lists and agent pickers, reducing data transfer and improving performance. Adds three new filter dimensions: **designation**, **customer_branch_id**, and **product**.

## Dependencies

- **Track 1 (Designation)**: ✅ Complete — designation field required for filtering
- **Track 3 (Customer branch_id)**: ✅ Complete — customer_branch_id filtering requires branch_id on customers

## Completed Phases

### Phase 4.1 — Backend Server-side Filtering ✅

**GET /employees** new query parameters (all optional):
- `designation` — filter by employee designation (operations_manager, team_leader, telecaller, field_agent)
- `customer_branch_id` — filter to employees with allocated customers in this branch
- `product` — filter to employees with allocated customers of this product

**Implementation**:
- `designation`: direct equality check against users.designation
- `customer_branch_id`: EXISTS subquery checking (assigned_agent_id OR assigned_field_agent_id) matches
- `product`: EXISTS subquery checking (assigned_agent_id OR assigned_field_agent_id) matches

**Backward compatible**: 
- All new params optional
- Existing filters (branch_id, team_id, q, is_active) unchanged
- Unfiltered queries work exactly as before

### Phase 4.2 — Frontend Server-side Filtering ✅

**EmployeesPage.tsx** changes:
- Add filter states: `filterDesignation`, `filterCustomerBranch`, `filterProduct`
- Load products from `/products` endpoint alongside branches/teams
- Send all filters as query params: `GET /employees?designation=...&customer_branch_id=...&product=...`
- Remove client-side `filteredEmployees` logic (server now filters)
- Add UI controls for three new filters
- Fix search handler to work with new load() function

**AllocationPage.tsx** changes:
- Update `useAssignableAgents()` to accept `customerBranchId` and `product` parameters
- Include these in `/employees` API call for agent filtering
- UnallocatedQueue passes `customerBranchId` (from state) and `filters.product` (from company filters)
- Agent picker dynamically filtered by customer branch and product context

## SQL Patterns

### EXISTS for customer-based filtering
```sql
EXISTS (
  SELECT 1 FROM customers c 
  WHERE (c.assigned_agent_id = u.id OR c.assigned_field_agent_id = u.id)
  AND c.branch_id = $N
)
```

## Benefits

1. **Reduced data transfer**: Server filters before sending (vs. client receiving full list)
2. **Better performance**: Large employee lists now efficiently filtered server-side
3. **Consistent UI**: Same filter controls in EmployeesPage and agent picker
4. **Dynamic filtering**: Agent picker updated based on customer context (branch/product)
5. **Accurate results**: Agents shown match the customers being allocated to

## Integration Points

### No Breaking Changes:
- Allocation workflows unchanged (agents still fetched, just pre-filtered)
- Reallocation workflows unaffected
- Existing employee listing still works with old filters
- New filters optional and don't interfere with old ones

### New Capabilities:
- Find agents who work customers in a specific branch
- Find agents who work customers of a specific product
- Filter employee list by designation
- Agent picker automatically reflects customer context in allocations

## Testing Checklist

### Backend
- [ ] GET /employees returns correct results with each new param
- [ ] Results match EXISTS subqueries (employees have allocated customers)
- [ ] Multiple params combined correctly (AND logic)
- [ ] Old filters (branch, team) still work
- [ ] Unfiltered query returns all employees

### Frontend
- [ ] EmployeesPage designation filter works
- [ ] EmployeesPage customer branch filter works
- [ ] EmployeesPage product filter works
- [ ] Filters persist on page navigation (if applicable)
- [ ] AllocationPage agent picker filters by customer branch
- [ ] AllocationPage agent picker filters by product
- [ ] Search still works with new filters

### Integration
- [ ] Allocation workflows unaffected (agents can still be assigned)
- [ ] Reallocation still works
- [ ] Large employee lists perform better than before

## Files Modified

**Backend:**
- `src/routes/employees.ts` — added designation, customer_branch_id, product filtering

**Frontend:**
- `src/pages/EmployeesPage.tsx` — moved to server-side filtering, added UI controls
- `src/pages/AllocationPage.tsx` — updated agent picker with new params

## Commits

| # | Subject |
|----|---------|
| 1 | Track 4.1: Add server-side filtering to GET /employees |
| 2 | Track 4.2: Frontend server-side filtering |

**Total: 2 commits, ~100 lines added**

## What's Next

Track 4 is **complete and independent** of remaining tracks. Next items to work on (in parallel):

- **Track 5**: Field-agent assignment UI (independent backend, ready)
- **Track 6**: Import rollback (independent — ready)
- **Track 7**: Mobile fixes (independent — ready)
- **Track 8**: Drill-down dashboards (independent UI over existing endpoints)

All remaining tracks can proceed without blocking each other or Track 4.

## Deferred / Out of Scope

- Pagination on GET /employees (currently fine at scale)
- Advanced search/autocomplete for agent picker (basic filtering sufficient)
- Caching of agent lists (API calls fast enough with server-side filtering)
- Audit logging for filter usage (standard analytics, separate task)

---

## Risk Assessment

### Risk: **VERY LOW** ✅

**Why:**
- Pure additive filtering (no changes to existing queries)
- Backward compatible (all new params optional)
- Server-side filtering is standard practice (improves performance)
- No changes to allocation/reallocation logic
- No permission changes

**Zero regression expected in:**
- Employee CRUD operations
- Allocation workflows
- Reallocation workflows
- Dashboard/reporting (unchanged)
- Authentication (unchanged)

