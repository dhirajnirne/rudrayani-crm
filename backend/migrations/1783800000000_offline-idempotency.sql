-- Up Migration
-- Task 4.3: offline mode. The app queues actions while offline and re-sends
-- them on reconnect; a dropped response must not create a second call log or
-- payment. Each queued action carries a client-generated UUID; (author, key)
-- is unique, so a re-send is detected and answered with the existing row.

ALTER TABLE call_logs ADD COLUMN client_key UUID;
CREATE UNIQUE INDEX uq_call_logs_client_key
  ON call_logs (agent_id, client_key) WHERE client_key IS NOT NULL;

ALTER TABLE payments ADD COLUMN client_key UUID;
CREATE UNIQUE INDEX uq_payments_client_key
  ON payments (collected_by_user_id, client_key) WHERE client_key IS NOT NULL;

-- Down Migration
DROP INDEX IF EXISTS uq_payments_client_key;
ALTER TABLE payments DROP COLUMN IF EXISTS client_key;
DROP INDEX IF EXISTS uq_call_logs_client_key;
ALTER TABLE call_logs DROP COLUMN IF EXISTS client_key;
