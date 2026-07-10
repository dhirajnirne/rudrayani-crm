-- Up Migration

-- MVP hardening: no cap on payment amount vs. what's actually owed (product
-- decision: warn, never block). This column is a server-stamped audit
-- signal, not client-trusted — set from the customer's due_amount at
-- insert time regardless of what the client sends, so it's a reliable
-- "spot-check these" filter for ops later even if a future client build
-- forgets to show the warning.
ALTER TABLE payments ADD COLUMN exceeds_due_amount BOOLEAN NOT NULL DEFAULT false;

-- Down Migration
ALTER TABLE payments DROP COLUMN IF EXISTS exceeds_due_amount;
