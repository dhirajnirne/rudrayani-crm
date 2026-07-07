-- Up Migration
-- Phase 7: allocation lifecycle. Client banks now resend a full, refreshed
-- allocation list mid-month (not just once a month), so the system must
-- diff the new file against the active book, flag additions/removals for
-- a human decision, and let a customer be pulled back by the lender
-- (recalled) without conflating that with the customer actually closing
-- (paid off). Also: canonical bucket numbers (so DPD-style bucket meaning
-- is comparable across lenders whose bucket labels differ wildly), a
-- payment-driven bucket movement event log (informational only -- the
-- lender's bucket label on `customers` stays authoritative), and
-- per-template "customer detail" column selection.

-- 1. recalled status: the lender withdrew the case mid-month. Distinct from
-- 'closed' (customer paid off) so billing/reporting never conflate the two.
ALTER TABLE customers DROP CONSTRAINT chk_customers_status;
ALTER TABLE customers ADD CONSTRAINT chk_customers_status
  CHECK (status IN ('active', 'closed', 'recalled'));
ALTER TABLE customers ADD COLUMN recalled_at TIMESTAMPTZ;

-- 2. Discrepancy review queue. Additions/removals/reactivations detected by
-- the import diff wait here for an agency_admin/operations_manager decision
-- instead of being applied automatically.
CREATE TABLE import_review_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_run_id UUID NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id),
    item_type TEXT NOT NULL CHECK (item_type IN ('addition', 'removal', 'reactivation')),
    customer_id UUID REFERENCES customers(id),   -- set for removal/reactivation; NULL for addition
    loan_number TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,  -- addition/reactivation: mapped fields + custom_fields
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_review_items_company_status ON import_review_items (company_id, status);
CREATE INDEX idx_review_items_run ON import_review_items (import_run_id);

-- 3. import_runs: surface the review queue size and newly-discovered
-- buckets/products (they drive reports) directly on the run record.
ALTER TABLE import_runs
    ADD COLUMN pending_review_rows INT NOT NULL DEFAULT 0,
    ADD COLUMN removal_rows INT NOT NULL DEFAULT 0,
    ADD COLUMN new_buckets JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN new_products JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 4. Template-level selection of which source columns are kept as
-- "customer detail" fields (shown in the customer 360 view).
ALTER TABLE import_templates
    ADD COLUMN detail_fields JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 5. Canonical bucket mapping: admin maps each lender's free-text bucket
-- label to a standard DPD-bucket number once (0 = X/current month EMI,
-- 1 = 30 DPD, 2 = 60 DPD, ...). NULL = not yet mapped.
ALTER TABLE buckets ADD COLUMN canonical_bucket INT;

-- 6. Bucket movement events: a payment shows a customer cleared their
-- arrears (informational "normalized" signal, does not touch
-- customers.bucket), or an allocation import confirms a bucket drop
-- between consecutive month snapshots.
CREATE TABLE bucket_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id),
    from_bucket TEXT NOT NULL,
    to_bucket TEXT,
    from_canonical INT,
    to_canonical INT,
    trigger TEXT NOT NULL CHECK (trigger IN ('payment', 'allocation')),
    month DATE NOT NULL,                  -- 1st of the month the movement belongs to
    payment_id UUID REFERENCES payments(id),
    import_run_id UUID REFERENCES import_runs(id),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bucket_movements_customer ON bucket_movements (customer_id);
CREATE INDEX idx_bucket_movements_company_month ON bucket_movements (company_id, month);
-- One payment-triggered event per customer per month (idempotent detection).
CREATE UNIQUE INDEX idx_bucket_movements_payment_once
    ON bucket_movements (customer_id, month) WHERE trigger = 'payment';

-- 7. Permission: reviewing import discrepancies is an agency_admin /
-- operations_manager action only (same tier as imports.manage).
INSERT INTO permissions (key, description) VALUES
    ('imports.review', 'Review import discrepancies (additions/removals) before they apply');
INSERT INTO capability_permissions (capability, permission_key) VALUES
    ('agency_admin', 'imports.review'),
    ('operations_manager', 'imports.review');

-- Down Migration
DELETE FROM capability_permissions WHERE permission_key = 'imports.review';
DELETE FROM permissions WHERE key = 'imports.review';
DROP TABLE bucket_movements;
ALTER TABLE buckets DROP COLUMN canonical_bucket;
ALTER TABLE import_templates DROP COLUMN detail_fields;
ALTER TABLE import_runs
    DROP COLUMN pending_review_rows,
    DROP COLUMN removal_rows,
    DROP COLUMN new_buckets,
    DROP COLUMN new_products;
DROP TABLE import_review_items;
ALTER TABLE customers DROP COLUMN recalled_at;
ALTER TABLE customers DROP CONSTRAINT chk_customers_status;
ALTER TABLE customers ADD CONSTRAINT chk_customers_status
    CHECK (status IN ('active', 'closed'));
