-- Up Migration

ALTER TABLE customers ADD COLUMN assigned_field_agent_id UUID REFERENCES users(id);
CREATE INDEX idx_customers_assigned_field_agent ON customers (assigned_field_agent_id) WHERE assigned_field_agent_id IS NOT NULL;

ALTER TABLE customer_month_snapshots ADD COLUMN assigned_field_agent_id UUID REFERENCES users(id);

ALTER TABLE allocation_logs ADD COLUMN slot TEXT NOT NULL DEFAULT 'primary';
ALTER TABLE allocation_logs ADD CONSTRAINT chk_allocation_logs_slot CHECK (slot IN ('primary', 'field'));

-- Down Migration

ALTER TABLE allocation_logs DROP CONSTRAINT chk_allocation_logs_slot;
ALTER TABLE allocation_logs DROP COLUMN slot;

ALTER TABLE customer_month_snapshots DROP COLUMN assigned_field_agent_id;

DROP INDEX IF EXISTS idx_customers_assigned_field_agent;
ALTER TABLE customers DROP COLUMN assigned_field_agent_id;
