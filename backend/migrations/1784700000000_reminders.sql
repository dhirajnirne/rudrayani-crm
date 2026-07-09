-- Up Migration

-- Agent-owned follow-up reminders (distinct from PTPs: not tied to a
-- disposition, can be free-standing or against a customer, agent sets them
-- manually). remind_at is a full timestamp (not just a date) so the mobile
-- app can schedule a local device notification at the right moment.
CREATE TABLE reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES agencies(id),
    customer_id UUID REFERENCES customers(id),
    agent_id UUID NOT NULL REFERENCES users(id),
    remind_at TIMESTAMPTZ NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
      CONSTRAINT chk_reminders_status CHECK (status IN ('pending', 'done', 'cancelled')),
    created_by UUID NOT NULL REFERENCES users(id),
    client_key UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reminders_agent_due ON reminders (agent_id, remind_at) WHERE status = 'pending';
CREATE INDEX idx_reminders_customer ON reminders (customer_id) WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX uq_reminders_client_key
  ON reminders (created_by, client_key) WHERE client_key IS NOT NULL;

INSERT INTO permissions (key, description) VALUES
    ('reminders.manage', 'Create and manage follow-up reminders');

INSERT INTO capability_permissions (capability, permission_key) VALUES
    ('agency_admin',        'reminders.manage'),
    ('operations_manager',  'reminders.manage'),
    ('team_leader',         'reminders.manage'),
    ('telecaller',          'reminders.manage'),
    ('field_agent',         'reminders.manage');

-- Down Migration
DELETE FROM capability_permissions WHERE permission_key = 'reminders.manage';
DELETE FROM permissions WHERE key = 'reminders.manage';
DROP TABLE IF EXISTS reminders;
