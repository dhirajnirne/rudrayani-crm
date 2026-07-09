-- Up Migration
ALTER TABLE customers ADD COLUMN import_run_id UUID REFERENCES import_runs(id);
CREATE INDEX idx_customers_import_run ON customers (import_run_id) WHERE import_run_id IS NOT NULL;

ALTER TABLE import_runs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Down Migration
DROP INDEX IF EXISTS idx_customers_import_run;
ALTER TABLE customers DROP COLUMN IF EXISTS import_run_id;
ALTER TABLE import_runs DROP COLUMN IF EXISTS deleted_at;
