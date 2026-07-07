-- Up Migration
-- Tasks 3.1-3.3: allocation audit trail, PTP records, customer lifecycle
-- status, structured call-log details, and the calling/payment permissions
-- (build brief Sections 5, 6, 8).

-- Customer journey ends at Closed (brief Section 6). Everything starts active.
ALTER TABLE customers
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
    CONSTRAINT chk_customers_status CHECK (status IN ('active', 'closed'));

CREATE INDEX idx_customers_assigned_agent ON customers (assigned_agent_id)
  WHERE assigned_agent_id IS NOT NULL;

-- Every (re)allocation is logged with who moved it, from/to, reason, timestamp
-- (brief Section 5: "Reallocation later: same action, logged with reason + timestamp").
CREATE TABLE allocation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    from_agent_id UUID REFERENCES users(id),    -- NULL on first allocation
    to_agent_id UUID NOT NULL REFERENCES users(id),
    allocated_by UUID NOT NULL REFERENCES users(id),
    reason TEXT,                                 -- NULL on first allocation, required on reallocation (enforced in API)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_allocation_logs_customer ON allocation_logs (customer_id);

-- Structured inputs captured with a disposition (amount/date/time/mode/...)
-- kept as data alongside the composed remark text.
ALTER TABLE call_logs
  ADD COLUMN details JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX idx_call_logs_customer ON call_logs (customer_id);
CREATE INDEX idx_call_logs_agent_time ON call_logs (agent_id, created_at);

-- Promise-to-pay records: created when a PTP-flavored disposition is logged.
-- status flips to kept/broken in reporting (Phase 5); reminders read pending rows.
CREATE TABLE ptps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    call_log_id UUID NOT NULL REFERENCES call_logs(id),
    agent_id UUID NOT NULL REFERENCES users(id),
    amount NUMERIC NOT NULL,
    promised_date DATE NOT NULL,
    mode TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
      CONSTRAINT chk_ptps_status CHECK (status IN ('pending', 'kept', 'broken')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ptps_promised_date ON ptps (promised_date) WHERE status = 'pending';
CREATE INDEX idx_ptps_customer ON ptps (customer_id);

-- Payment bookkeeping: created_at is when the row was recorded; paid_at is the
-- business date the money changed hands (agent-entered, may be earlier).
ALTER TABLE payments
  ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX idx_payments_customer ON payments (customer_id);

-- New permissions for the calling/payment workflow. Grants follow brief
-- Section 3: admins/ops get everything; TLs and agents work customers.
INSERT INTO permissions (key, description) VALUES
    ('calls.log',       'Log call/visit dispositions against customers'),
    ('payments.record', 'Record payments with photo proof');

INSERT INTO capability_permissions (capability, permission_key) VALUES
    ('agency_admin',        'calls.log'),
    ('agency_admin',        'payments.record'),
    ('operations_manager',  'calls.log'),
    ('operations_manager',  'payments.record'),
    ('team_leader',         'calls.log'),
    ('team_leader',         'payments.record'),
    ('telecaller',          'calls.log'),
    ('telecaller',          'payments.record'),
    ('field_agent',         'calls.log'),
    ('field_agent',         'payments.record');

-- Down Migration
DELETE FROM capability_permissions WHERE permission_key IN ('calls.log', 'payments.record');
DELETE FROM permissions WHERE key IN ('calls.log', 'payments.record');
ALTER TABLE payments DROP COLUMN IF EXISTS created_at;
DROP INDEX IF EXISTS idx_payments_customer;
DROP TABLE IF EXISTS ptps;
DROP INDEX IF EXISTS idx_call_logs_customer;
DROP INDEX IF EXISTS idx_call_logs_agent_time;
ALTER TABLE call_logs DROP COLUMN IF EXISTS details;
DROP TABLE IF EXISTS allocation_logs;
DROP INDEX IF EXISTS idx_customers_assigned_agent;
ALTER TABLE customers DROP COLUMN IF EXISTS status;
