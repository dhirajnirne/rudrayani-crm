-- Up Migration
-- Monthly allocation cycles (Phase 5 dashboard): every month the client bank
-- sends a fresh allocation file with updated buckets/amounts per loan. The
-- import wizard's "allocation" mode UPDATES existing loans and records a
-- per-month snapshot — the snapshot is the "allocated book" the performance
-- metrics are computed against, and bucket transitions between consecutive
-- months drive Resolution/Rollback/Normalization.

CREATE TABLE customer_month_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id),
    month DATE NOT NULL,                 -- always the 1st of the month
    bucket TEXT,
    due_amount NUMERIC(14, 2),           -- POS / allocated amount for the month
    emi NUMERIC(14, 2),
    product TEXT,
    assigned_team_id UUID REFERENCES teams(id),
    assigned_agent_id UUID REFERENCES users(id),
    import_run_id UUID REFERENCES import_runs(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (customer_id, month)
);
CREATE INDEX idx_snapshots_company_month ON customer_month_snapshots (company_id, month);
CREATE INDEX idx_snapshots_agent_month ON customer_month_snapshots (assigned_agent_id, month);

ALTER TABLE import_runs
    ADD COLUMN mode TEXT NOT NULL DEFAULT 'new' CHECK (mode IN ('new', 'allocation')),
    ADD COLUMN allocation_month DATE,
    ADD COLUMN updated_rows INT NOT NULL DEFAULT 0;

-- Down Migration
ALTER TABLE import_runs DROP COLUMN mode, DROP COLUMN allocation_month, DROP COLUMN updated_rows;
DROP TABLE customer_month_snapshots;
