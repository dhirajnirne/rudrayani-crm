-- Up Migration
-- Phase 12: role-based dashboards. Two small schema additions that back new
-- KPIs on the web Management Dashboard and the mobile Field Executive /
-- Telecaller dashboards -- everything else in Phase 12 reuses existing
-- tables/endpoints.

-- 12a KPI #10 (Settlement vs EMI Collections): tag every payment at capture
-- time so collections can be split by type. Existing rows default to 'emi'
-- (the overwhelming majority of historical collections).
ALTER TABLE payments ADD COLUMN type TEXT NOT NULL DEFAULT 'emi'
  CONSTRAINT chk_payments_type CHECK (type IN ('emi', 'settlement'));

-- 12b: the Field Executive and Telecaller mobile dashboards show the agent's
-- OWN attendance/GPS/route (brief: reuse /tracking/team-day, /tracking/route)
-- -- both currently sit behind tracking.view, granted only to
-- agency_admin/operations_manager/team_leader. Grant it to telecaller and
-- field_agent too; the accompanying scope.ts change adds a self-only
-- fallback so this never widens visibility beyond "my own row" for these two
-- capabilities (team_leader/admin/ops keep their existing broader scope).
INSERT INTO capability_permissions (capability, permission_key) VALUES
    ('telecaller',   'tracking.view'),
    ('field_agent',  'tracking.view');

-- Down Migration
DELETE FROM capability_permissions
 WHERE permission_key = 'tracking.view' AND capability IN ('telecaller', 'field_agent');
ALTER TABLE payments DROP COLUMN IF EXISTS type;
