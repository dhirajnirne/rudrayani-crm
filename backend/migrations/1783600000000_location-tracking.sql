-- Up Migration
-- Task 4.1: attendance punch-in/out, location-ping ingestion, and the
-- tunable tracking config (build brief Sections 9, 10).

-- Per-agency settings blob (brief Section 9: ping interval is "a config
-- value rather than a hardcoded constant"; Phase 6 adds the admin UI).
ALTER TABLE agencies
  ADD COLUMN settings JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Attendance rows are always created by a punch-in, so the timestamp is
-- mandatory (the baseline table left it nullable).
UPDATE attendance SET punch_in_at = now() WHERE punch_in_at IS NULL;
ALTER TABLE attendance
  ALTER COLUMN punch_in_at SET DEFAULT now(),
  ALTER COLUMN punch_in_at SET NOT NULL;

-- One open shift per user: a second punch-in without a punch-out is a 409
-- in the API, and this index makes the rule race-proof.
CREATE UNIQUE INDEX uq_attendance_open_shift ON attendance (user_id)
  WHERE punch_out_at IS NULL;
CREATE INDEX idx_attendance_user_time ON attendance (user_id, punch_in_at);

-- Offline catch-up batches may be re-sent after a dropped response; a ping
-- is identified by who + when, so re-inserts can ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX uq_location_pings_user_time ON location_pings (user_id, recorded_at);

-- Every employee is tracked punch-in to punch-out (brief Section 9), so all
-- capabilities get the permission.
INSERT INTO permissions (key, description) VALUES
    ('attendance.punch', 'Punch in/out and send location pings');

INSERT INTO capability_permissions (capability, permission_key) VALUES
    ('agency_admin',        'attendance.punch'),
    ('operations_manager',  'attendance.punch'),
    ('team_leader',         'attendance.punch'),
    ('telecaller',          'attendance.punch'),
    ('field_agent',         'attendance.punch');

-- Down Migration
DELETE FROM capability_permissions WHERE permission_key = 'attendance.punch';
DELETE FROM permissions WHERE key = 'attendance.punch';
DROP INDEX IF EXISTS uq_location_pings_user_time;
DROP INDEX IF EXISTS idx_attendance_user_time;
DROP INDEX IF EXISTS uq_attendance_open_shift;
ALTER TABLE attendance
  ALTER COLUMN punch_in_at DROP NOT NULL,
  ALTER COLUMN punch_in_at DROP DEFAULT;
ALTER TABLE agencies DROP COLUMN IF EXISTS settings;
