-- Up Migration
-- Deposit tracking (Phase 5 dashboard "Deposited Metrics"): a payment is
-- collected in the field, then the cash is deposited to the branch/bank.
-- Admin/ops mark payments deposited; pending = collected but not yet banked.

ALTER TABLE payments
    ADD COLUMN deposited_at TIMESTAMPTZ,
    ADD COLUMN deposited_by_user_id UUID REFERENCES users(id);

CREATE INDEX idx_payments_undeposited ON payments (created_at) WHERE deposited_at IS NULL;

INSERT INTO permissions (key, description) VALUES
    ('payments.deposit', 'Mark collected payments as deposited');
INSERT INTO capability_permissions (capability, permission_key) VALUES
    ('agency_admin', 'payments.deposit'),
    ('operations_manager', 'payments.deposit');

-- Down Migration
DELETE FROM capability_permissions WHERE permission_key = 'payments.deposit';
DELETE FROM permissions WHERE key = 'payments.deposit';
DROP INDEX idx_payments_undeposited;
ALTER TABLE payments DROP COLUMN deposited_at, DROP COLUMN deposited_by_user_id;
