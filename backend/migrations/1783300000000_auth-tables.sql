-- Up Migration
-- Task 1.2: auth infrastructure — sessions, lockout, OTP reset, and the
-- configurable capability->permission model (build brief Section 3: permissions
-- live in tables, not hardcoded per role).

ALTER TABLE users
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN locked_until TIMESTAMPTZ;

-- Refresh tokens: hashed at rest, one row per issued token, rotated on use.
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    device_id TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);

-- SMS OTPs for password reset (build brief Section 10). Hashed at rest;
-- expiry + attempt cap enforced in the auth service.
CREATE TABLE otp_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    otp_hash TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'password_reset',
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_requests_user ON otp_requests (user_id);

-- Permission catalog + which capability grants which permission.
-- Role tweaks are data changes here, never code changes.
CREATE TABLE permissions (
    key TEXT PRIMARY KEY,           -- e.g. 'employees.create'
    description TEXT
);

CREATE TABLE capability_permissions (
    capability TEXT NOT NULL,       -- agency_admin | operations_manager | team_leader | telecaller | field_agent
    permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
    PRIMARY KEY (capability, permission_key)
);

INSERT INTO permissions (key, description) VALUES
    ('employees.view',       'View employees'),
    ('employees.create',     'Add employees and assign branch/team/designation'),
    ('employees.update',     'Edit employees, toggle capabilities'),
    ('employees.deactivate', 'Deactivate employees'),
    ('ops_managers.create',  'Add another Operations Manager (Agency Admin only)'),
    ('billing.view',         'Access billing (Agency Admin only)'),
    ('branches.manage',      'Create/edit branches'),
    ('teams.manage',         'Create/edit teams'),
    ('companies.manage',     'Create/edit client companies'),
    ('imports.manage',       'Configure import templates and run imports'),
    ('dispositions.manage',  'Maintain the disposition code master'),
    ('customers.view',       'View customers / own worklist'),
    ('customers.allocate',   'Allocate customers to agents'),
    ('reports.view',         'View reports and dashboards');

-- Agency Admin: everything (kept in data so it stays configurable).
INSERT INTO capability_permissions (capability, permission_key)
SELECT 'agency_admin', key FROM permissions;

-- Operations Manager: everything EXCEPT adding another Ops Manager and billing
-- (build brief Section 3, confirmed).
INSERT INTO capability_permissions (capability, permission_key)
SELECT 'operations_manager', key FROM permissions
WHERE key NOT IN ('ops_managers.create', 'billing.view');

INSERT INTO capability_permissions (capability, permission_key) VALUES
    ('team_leader', 'customers.view'),
    ('team_leader', 'customers.allocate'),
    ('team_leader', 'employees.view'),
    ('team_leader', 'reports.view'),
    ('telecaller',  'customers.view'),
    ('field_agent', 'customers.view');

-- Down Migration
DROP TABLE IF EXISTS capability_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS otp_requests;
DROP TABLE IF EXISTS refresh_tokens;
ALTER TABLE users
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS failed_login_attempts,
  DROP COLUMN IF EXISTS locked_until;
