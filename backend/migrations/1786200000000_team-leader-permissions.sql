-- Up Migration
-- Grant permissions for Team Leaders to create branches, teams, and employees.
INSERT INTO capability_permissions (capability, permission_key) VALUES
    ('team_leader', 'employees.create'),
    ('team_leader', 'branches.manage'),
    ('team_leader', 'teams.manage')
ON CONFLICT DO NOTHING;

-- Down Migration
DELETE FROM capability_permissions
WHERE capability = 'team_leader'
  AND permission_key IN ('employees.create', 'branches.manage', 'teams.manage');
