-- Up Migration
-- Monthly targets (Phase 5 dashboard): set by admin/ops per metric at any
-- scope (agency-wide, branch, team, agent), optionally narrowed to a
-- company/product/bucket slice. The dashboard's Target / Target % / Required
-- run-rate numbers all resolve from here.

CREATE TABLE targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    month DATE NOT NULL,                 -- always the 1st of the month
    metric TEXT NOT NULL CHECK (metric IN
        ('resolution', 'rollback', 'normalization', 'recovery', 'collection')),
    scope_type TEXT NOT NULL CHECK (scope_type IN ('agency', 'branch', 'team', 'agent')),
    scope_id UUID,                       -- NULL only for scope_type = 'agency'
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,  -- NULL = all companies
    product TEXT,                        -- NULL = all products
    bucket TEXT,                         -- NULL = all buckets
    target_amount NUMERIC(14, 2),
    target_count INT,
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (scope_type = 'agency' OR scope_id IS NOT NULL)
);

-- One row per unique dimension combination (NULLs collapse to sentinels).
CREATE UNIQUE INDEX uq_targets_dims ON targets (
    agency_id, month, metric, scope_type,
    COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'),
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'),
    COALESCE(product, ''),
    COALESCE(bucket, '')
);
CREATE INDEX idx_targets_month ON targets (agency_id, month);

INSERT INTO permissions (key, description) VALUES
    ('targets.manage', 'Set monthly collection/metric targets');
INSERT INTO capability_permissions (capability, permission_key) VALUES
    ('agency_admin', 'targets.manage'),
    ('operations_manager', 'targets.manage');

-- Down Migration
DELETE FROM capability_permissions WHERE permission_key = 'targets.manage';
DELETE FROM permissions WHERE key = 'targets.manage';
DROP TABLE targets;
