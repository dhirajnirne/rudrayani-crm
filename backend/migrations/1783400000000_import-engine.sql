-- Up Migration
-- Task 2.1/2.2: import template versioning, import run audit, product catalog,
-- and the duplicate-loan-number guarantee (build brief Section 4).

ALTER TABLE import_templates
  ADD COLUMN version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN created_by UUID REFERENCES users(id),
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- One loan number per company (duplicates rejected at preview; this backs it).
CREATE UNIQUE INDEX idx_customers_company_loan ON customers (company_id, loan_number);

-- Audit trail of every committed import.
CREATE TABLE import_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    template_id UUID REFERENCES import_templates(id),
    uploaded_by UUID REFERENCES users(id),
    file_name TEXT,
    total_rows INTEGER NOT NULL,
    inserted_rows INTEGER NOT NULL,
    duplicate_rows INTEGER NOT NULL,
    error_rows INTEGER NOT NULL,
    errors JSONB DEFAULT '[]'::jsonb,   -- first N row-level problems, for review
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Products are derived from imported data per company (brief Section 4):
-- raw_label = exactly what the sheet said; canonical_label = admin-normalized
-- grouping ("HL" and "Home Loan" -> "Home Loan") without re-importing.
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    raw_label TEXT NOT NULL,
    canonical_label TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, raw_label)
);

-- Down Migration
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS import_runs;
DROP INDEX IF EXISTS idx_customers_company_loan;
ALTER TABLE import_templates
  DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS updated_at;
