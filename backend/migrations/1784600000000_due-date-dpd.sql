-- Up Migration
-- Phase 7 correction: buckets have been 100% lender-supplied with no
-- independent aging calculation, matching the original brief's assumption.
-- Standard collection-agency practice is to also track the EMI due date and
-- compute DPD (days past due) independently, to catch cases where the
-- lender's stated bucket disagrees with what the due date implies -- purely
-- as a cross-check. The lender's bucket stays authoritative for billing and
-- reporting; this never overrides `customers.bucket`.

ALTER TABLE customers ADD COLUMN due_date DATE;
ALTER TABLE customer_month_snapshots ADD COLUMN due_date DATE;

-- Down Migration
ALTER TABLE customer_month_snapshots DROP COLUMN due_date;
ALTER TABLE customers DROP COLUMN due_date;
