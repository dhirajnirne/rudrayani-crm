-- Add independent branch_id to customers (Track 3, Phase 3.1)
-- This allows filtering/organizing customers by their branch, independent of team allocation.
-- Nullable: existing rows are unaffected until explicitly set.

ALTER TABLE customers ADD COLUMN branch_id UUID REFERENCES branches(id);
CREATE INDEX idx_customers_branch_id ON customers(branch_id);
