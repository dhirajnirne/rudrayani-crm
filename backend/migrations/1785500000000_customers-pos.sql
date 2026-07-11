-- Up Migration

-- Owner feedback round, Phase 1: POS (principal outstanding) has always been
-- silently conflated with due_amount (the demo seed literally maps an Excel
-- "POS" column to due_amount) -- split them into two distinct columns so
-- POS can become its own required, independently-tracked system field.
ALTER TABLE customers ADD COLUMN pos NUMERIC(14,2);
ALTER TABLE customer_month_snapshots ADD COLUMN pos NUMERIC(14,2);

-- Down Migration
ALTER TABLE customer_month_snapshots DROP COLUMN IF EXISTS pos;
ALTER TABLE customers DROP COLUMN IF EXISTS pos;
