-- Up Migration
-- Buckets master (Phase 5 dashboard): bucket labels vary per company and the
-- performance metrics need an ORDER (did the account flow forward or roll
-- back?) plus a category (NPA buckets feed the Recovery metric) and a
-- "current" flag (the bucket that means the account is fully normalized).
-- Rows are auto-registered by imports; admins only fix order/flags.

CREATE TABLE buckets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT 'normal' CHECK (category IN ('normal', 'npa')),
    is_current BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, label)
);

-- Backfill from data already imported so the admin grid starts populated.
INSERT INTO buckets (company_id, label, sort_order)
SELECT company_id, bucket,
       row_number() OVER (PARTITION BY company_id ORDER BY bucket) - 1
  FROM (SELECT DISTINCT company_id, bucket FROM customers WHERE bucket IS NOT NULL) d;

-- Down Migration
DROP TABLE buckets;
