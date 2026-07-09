-- Up Migration

-- Generic supporting documents against a customer (KYC docs, agreements,
-- ID proofs, etc.) -- distinct from the single hard-coded photo fields on
-- payments/field_visits, which stay as-is. Images AND PDFs, multiple per
-- customer, kept separately identifiable by `kind` for UI icon/preview logic.
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES agencies(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    uploaded_by UUID NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL CONSTRAINT chk_attachments_kind CHECK (kind IN ('photo', 'document')),
    file_key TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    note TEXT,
    client_key UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_attachments_customer ON attachments (customer_id);
CREATE UNIQUE INDEX uq_attachments_client_key
  ON attachments (uploaded_by, client_key) WHERE client_key IS NOT NULL;

-- Down Migration
DROP TABLE IF EXISTS attachments;
