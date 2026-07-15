-- Track 6.1: Import rollback infrastructure - backup table schema
-- Stores pre-change state for import rows to enable safe rollback

CREATE TABLE import_row_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_run_id UUID NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id),
    kind VARCHAR(20) NOT NULL DEFAULT 'update', -- 'update' | 'addition' | 'reactivation' | 'removal'
    prior_values JSONB NOT NULL, -- Complete row state before change
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(import_run_id, customer_id)
);

CREATE INDEX idx_import_row_backups_run ON import_row_backups(import_run_id);
CREATE INDEX idx_import_row_backups_customer ON import_row_backups(customer_id);

-- Add rolled_back_at column to import_runs to track rollback status
ALTER TABLE import_runs ADD COLUMN rolled_back_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX idx_import_runs_rolled_back ON import_runs(rolled_back_at);
