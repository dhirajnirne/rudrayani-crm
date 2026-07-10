-- Up Migration

-- Agent-initiated correction requests for payments/call-logs/PTPs (MVP
-- hardening: previously there was no way to fix a mistaken amount or
-- disposition code after saving, anywhere in the app). One JSON shape
-- covers all three record types so this stays extensible without another
-- migration if more fields become correctable later; the allow-list of
-- which fields are actually correctable lives in the route handler, not
-- the schema.
CREATE TABLE correction_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_type TEXT NOT NULL CHECK (record_type IN ('payment', 'call_log', 'ptp')),
    record_id UUID NOT NULL,
    requested_by UUID NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    proposed_changes JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CONSTRAINT chk_correction_requests_status CHECK (status IN ('pending', 'approved', 'rejected')),
    decided_by UUID REFERENCES users(id),
    decided_at TIMESTAMPTZ,
    decision_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_correction_requests_pending ON correction_requests (status) WHERE status = 'pending';
CREATE INDEX idx_correction_requests_requested_by ON correction_requests (requested_by);

-- Down Migration
DROP TABLE IF EXISTS correction_requests;
