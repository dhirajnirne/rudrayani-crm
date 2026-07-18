-- Up Migration
-- branch_manager sits above team_leader, below operations_manager: broad
-- branch-scoped visibility/management, but deliberately NOT everything
-- operations_manager has. Excluded on purpose (same escalation boundary
-- team_leader already respects): employees.update/deactivate,
-- companies.manage/imports.manage/dispositions.manage (agency-wide master
-- data, not branch-scoped), ops_managers.create/billing.view (admin only).
INSERT INTO capability_permissions (capability, permission_key) VALUES
    ('branch_manager', 'customers.view'),
    ('branch_manager', 'customers.allocate'),
    ('branch_manager', 'employees.view'),
    ('branch_manager', 'employees.create'),
    ('branch_manager', 'branches.manage'),
    ('branch_manager', 'teams.manage'),
    ('branch_manager', 'reports.view'),
    ('branch_manager', 'reports.view_self'),
    ('branch_manager', 'tracking.view')
ON CONFLICT DO NOTHING;

-- Down Migration
DELETE FROM capability_permissions WHERE capability = 'branch_manager';
