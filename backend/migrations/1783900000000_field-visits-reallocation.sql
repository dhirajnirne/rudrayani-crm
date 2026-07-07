-- Up Migration
-- Task 4.4: field-visit evidence (photo + customer signature) and the
-- agent-initiated reallocation-request flow the TL approves (brief §8).

CREATE TABLE field_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    agent_id UUID NOT NULL REFERENCES users(id),
    photo_url TEXT,
    signature_url TEXT,
    remark TEXT,
    location GEOGRAPHY(POINT, 4326),
    client_key UUID,                        -- offline-sync idempotency
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_field_visits_customer ON field_visits (customer_id);
CREATE UNIQUE INDEX uq_field_visits_client_key
  ON field_visits (agent_id, client_key) WHERE client_key IS NOT NULL;

-- An agent asks for a customer to be moved (wrong area, language, dispute);
-- someone with customers.allocate approves (reassign / return to pool) or
-- rejects. The request row doubles as the audit trail.
CREATE TABLE reallocation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id),
    requested_by UUID NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CONSTRAINT chk_realloc_status CHECK (status IN ('pending', 'approved', 'rejected')),
    decided_by UUID REFERENCES users(id),
    decided_at TIMESTAMPTZ,
    decision_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One open request per customer.
CREATE UNIQUE INDEX uq_realloc_pending ON reallocation_requests (customer_id)
  WHERE status = 'pending';

-- Down Migration
DROP TABLE IF EXISTS reallocation_requests;
DROP TABLE IF EXISTS field_visits;
