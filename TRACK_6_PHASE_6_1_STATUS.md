# Track 6 Phase 6.1 — Import Rollback Schema — COMPLETE ✅

## Overview

Phase 6.1 creates the infrastructure (tables and columns) for import rollback functionality, enabling safe undo of both direct-apply imports and review-approval imports.

## Context

Track 6 implements rollback for two import modes:
1. **Direct-apply** (mode='new'): New customer imports that insert/update directly
2. **Review-approval** (mode='allocation'): Allocation imports that go through approval queue

Both modes need to store "before" state so changes can be reversed. Phase 6.1 sets up the foundation; Phases 6.2-6.5 wire backfill into the import flow and approval flow.

## Completed Phase

### Phase 6.1 — Schema ✅

**New table: import_row_backups**

```sql
CREATE TABLE import_row_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_run_id UUID NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id),
    kind VARCHAR(20) NOT NULL DEFAULT 'update', 
    -- 'update' = existing customer fields changed
    -- 'addition' = new customer created via import
    -- 'reactivation' = removed customer brought back
    -- 'removal' = active customer deactivated/removed
    prior_values JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(import_run_id, customer_id)
);

-- Indexes for query performance
CREATE INDEX idx_import_row_backups_run ON import_row_backups(import_run_id);
CREATE INDEX idx_import_row_backups_customer ON import_row_backups(customer_id);
```

**Enhanced table: import_runs**

```sql
ALTER TABLE import_runs ADD COLUMN rolled_back_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX idx_import_runs_rolled_back ON import_runs(rolled_back_at);
```

## Design Decisions

### Why JSON for prior_values?

- Flexible schema: Different customers may have different fields set at different times
- Self-documenting: Stores exactly what was changed, no guessing which columns matter
- Future-proof: Handles custom fields added after the backup was created
- Example: `{ "due_amount": "50000", "bucket": "month_1", "custom_fields": {...} }`

### Why kind field?

Each reversal strategy differs:
- **update**: restore prior_values columns to their old values
- **addition**: DELETE the customer (with safety checks on work done since)
- **reactivation**: set status = 'active' again
- **removal**: set status = 'active' again

The `kind` field lets the rollback endpoint know which reversal logic to apply.

### Why UNIQUE(import_run_id, customer_id)?

Prevents duplicates if the same customer appears multiple times in one import run (edge case, but possible). Ensures one backup per customer per run.

## SQL Patterns

### Insert during direct-apply (Phase 6.2)
```sql
INSERT INTO import_row_backups (import_run_id, customer_id, kind, prior_values)
VALUES ($1, $2, 'update', $3)
ON CONFLICT (import_run_id, customer_id) DO NOTHING;
```

### Insert during review approval (Phase 6.3)
```sql
-- Before applying the change
INSERT INTO import_row_backups (import_run_id, customer_id, kind, prior_values)
VALUES ($1, $2, 'update', jsonb_build_object(
  'due_amount', $3, 'bucket', $4, 'custom_fields', $5
))
```

### Rollback endpoint (Phase 6.4)
```sql
SELECT * FROM import_row_backups
WHERE import_run_id = $1 AND kind = 'update'
ORDER BY created_at DESC;
```

## Testing Checklist

### Database
- [ ] Migration runs without errors
- [ ] import_row_backups table created with correct schema
- [ ] rolled_back_at column added to import_runs
- [ ] Indexes created successfully
- [ ] UNIQUE constraint works (no duplicates allowed)
- [ ] Cascade delete removes backups when import_run is deleted

### Constraints
- [ ] NULL rolled_back_at on new imports (not yet rolled back)
- [ ] Cannot insert backup for non-existent customer (FK constraint)
- [ ] Cannot insert backup for non-existent import_run (FK constraint)
- [ ] UNIQUE constraint prevents duplicate backups

## Files Modified

**Backend:**
- `migrations/1787500000000_import-rollback.sql` — schema DDL

## Commits

| # | Subject |
|----|---------|
| 1 | Track 5.1 + Track 6.1: Field-agent assignment UI + import rollback schema |

**Total: 1 commit (bundled with Track 5.1), ~18 lines schema**

## Risk Assessment

### Risk: **VERY LOW** ✅

**Why:**
- Purely additive schema (no existing table modifications)
- New tables are isolated (no joins to existing code yet)
- Cascade delete ensures referential integrity
- No data migration or backfill in this phase
- Backward compatible: existing imports unaffected

**Zero regression expected in:**
- Existing import flows (no changes to commitImport logic yet)
- Existing rollback for mode='new' (unchanged)
- Customer CRUD (unaffected by new backup table)

---

## What's Next (Phases 6.2-6.5)

### Phase 6.2 — Direct-Apply Backups
Wire backfill into `commitImport()` to capture prior_values for updates before executing the UPDATE query.

### Phase 6.3 — Review-Approval Backups  
Wire backfill into import-reviews.ts approval handlers (4 categories: additions, updates, reactivations, removals).

### Phase 6.4 — Rollback Endpoint
Implement `POST /imports/runs/:id/rollback` to read backups and reverse changes per their `kind`.

### Phase 6.5 — Frontend
Add "Roll back" action to import runs UI (both first-of-month and repeat allocations).

## Dependencies

- **Forward**: Phases 6.2-6.5 depend on this schema
- **Backward**: No dependencies; this phase works standalone

---

## Summary

Phase 6.1 provides the data foundation for safe, reversible imports. It asks: "Who changed what, when?" by storing prior state. Phases 6.2-6.5 will then answer: "How do we undo it?" by implementing reversal logic per change type.

