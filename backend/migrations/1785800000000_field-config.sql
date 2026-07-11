-- Up Migration

-- Owner feedback round, Phase 10: system fields move from a compile-time
-- TypeScript const (import-service.ts SYSTEM_FIELDS/REQUIRED_MAPPED_FIELDS)
-- to an agency-level master catalog with per-company configuration. This is
-- the largest structural change of the round -- everything else (runtime
-- resolveFieldCatalog(), the FieldConfigPage admin UI) is built on these two
-- tables.

-- ON DELETE CASCADE on both FK columns below matches the precedent in
-- buckets-master.sql / targets.sql: every test file that creates a
-- throwaway agency/company in beforeAll() deletes it in afterAll() without
-- knowing about tables added afterwards, so a plain agencies/companies
-- delete must cascade cleanly or every existing test suite's cleanup breaks.

-- Agency-level master catalog: every field an Excel column could ever map
-- to for companies of this agency. Core fields (is_core=true) are seeded
-- below and can never be hard-deleted (see field-config-service.ts) -- only
-- disabled per company via company_field_settings. storage_column is the
-- real `customers` column the value lands in, or NULL when the field has no
-- native column and routes into custom_fields (e.g. address, or any
-- admin-added field -- exactly how "address" already behaved pre-Phase 10).
CREATE TABLE system_field_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    field_key VARCHAR(100) NOT NULL,
    label VARCHAR(200) NOT NULL,
    storage_column VARCHAR(100),
    -- 'text' | 'numeric' | 'date' | 'resolver' (agent_phone: not stored data,
    -- resolves to assigned_agent_id/assigned_team_id -- see import-service.ts)
    field_type VARCHAR(20) NOT NULL DEFAULT 'text',
    is_core BOOLEAN NOT NULL DEFAULT false,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agency_id, field_key)
);
CREATE INDEX idx_system_field_definitions_agency ON system_field_definitions (agency_id);

-- Per-company configuration of the agency's master catalog. A missing row
-- for a (company, field_key) pair falls back to sensible defaults at query
-- time (resolveFieldCatalog(): is_enabled defaults to the definition's
-- is_core, is_required defaults to false) -- see field-config-service.ts.
CREATE TABLE company_field_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    field_key VARCHAR(100) NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    is_required BOOLEAN NOT NULL DEFAULT false,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, field_key)
);
CREATE INDEX idx_company_field_settings_company ON company_field_settings (company_id);

-- Seed every existing agency with the 10 core loan-ledger fields
-- (import-service.ts SYSTEM_FIELDS, minus "address") plus "address" itself
-- as a non-core field -- address was already a mappable system field before
-- Phase 10 (routed to custom_fields, no native column) and dropping it from
-- the catalog here would silently break any company that already relies on
-- mapping it. Order matches the existing SYSTEM_FIELDS array exactly.
INSERT INTO system_field_definitions (agency_id, field_key, label, storage_column, field_type, is_core, sort_order)
SELECT a.id, f.field_key, f.label, f.storage_column, f.field_type, f.is_core, f.sort_order
  FROM agencies a
 CROSS JOIN (VALUES
    ('loan_number',   'Loan Number',                  'loan_number',  'text',     true,  0),
    ('customer_name', 'Customer Name',                'customer_name','text',     true,  1),
    ('mobile_number', 'Mobile Number',                'mobile_number','text',     true,  2),
    ('product',       'Product',                      'product',      'text',     true,  3),
    ('bucket',        'Bucket',                       'bucket',       'text',     true,  4),
    ('due_amount',    'Due Amount',                   'due_amount',   'numeric',  true,  5),
    ('pos',           'POS — Principal Outstanding',  'pos',          'numeric',  true,  6),
    ('emi',           'EMI Amount',                   'emi',          'numeric',  true,  7),
    ('emi_due_date',  'EMI Due Date',                 'due_date',     'date',     true,  8),
    ('agent_phone',   'Agent Phone',                  NULL,           'resolver', true,  9),
    ('address',       'Address',                      NULL,           'text',     false, 10)
 ) AS f(field_key, label, storage_column, field_type, is_core, sort_order)
ON CONFLICT (agency_id, field_key) DO NOTHING;

-- Seed every existing company as all-enabled, with the 9 fields that were
-- already enforced as REQUIRED_MAPPED_FIELDS in import-service.ts marked
-- required. NOTE: emi_due_date is deliberately left NOT required here even
-- though it's a core field -- that mirrors the deliberate, well-tested
-- exclusion already in import-service.ts (a company may not share due dates
-- from day one; e2e-allocation-lifecycle.test.ts depends on this exact
-- scenario). Marking it required for every pre-existing company would be a
-- real regression, not the "100% backwards compatibility" this seed is
-- supposed to preserve.
INSERT INTO company_field_settings (company_id, field_key, is_enabled, is_required, sort_order)
SELECT c.id, d.field_key, true,
       d.field_key IN ('loan_number','customer_name','mobile_number','product',
                        'bucket','due_amount','pos','emi','agent_phone'),
       d.sort_order
  FROM companies c
  JOIN system_field_definitions d ON d.agency_id = c.agency_id
ON CONFLICT (company_id, field_key) DO NOTHING;

-- Down Migration
DROP TABLE IF EXISTS company_field_settings;
DROP TABLE IF EXISTS system_field_definitions;
