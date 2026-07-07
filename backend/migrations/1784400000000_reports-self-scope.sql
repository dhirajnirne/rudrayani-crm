-- Up Migration
-- Phase 5: every user can see their OWN performance dashboard (collection vs
-- target etc. — the mobile "My Performance" screen). The full filterable
-- dashboard stays behind reports.view (admin/ops/TL). The report routes
-- accept either permission and clamp the scope server-side.

INSERT INTO permissions (key, description) VALUES
    ('reports.view_self', 'View own performance dashboard');

INSERT INTO capability_permissions (capability, permission_key) VALUES
    ('agency_admin', 'reports.view_self'),
    ('operations_manager', 'reports.view_self'),
    ('team_leader', 'reports.view_self'),
    ('telecaller', 'reports.view_self'),
    ('field_agent', 'reports.view_self');

-- Down Migration
DELETE FROM capability_permissions WHERE permission_key = 'reports.view_self';
DELETE FROM permissions WHERE key = 'reports.view_self';
