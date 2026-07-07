-- Up Migration
-- Live tracking + route replay for managers (build brief Section 9: web
-- portal renders the day's pings as a polyline, live and historical).
-- Team Leaders see their own team; Ops Managers and Agency Admins see the
-- whole agency (brief Section 3 hierarchy). Agents do not get this.

INSERT INTO permissions (key, description) VALUES
    ('tracking.view', 'View live agent locations and route replay');

INSERT INTO capability_permissions (capability, permission_key) VALUES
    ('agency_admin',        'tracking.view'),
    ('operations_manager',  'tracking.view'),
    ('team_leader',         'tracking.view');

-- Down Migration
DELETE FROM capability_permissions WHERE permission_key = 'tracking.view';
DELETE FROM permissions WHERE key = 'tracking.view';
