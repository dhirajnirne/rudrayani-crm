-- Additive: agent_type lets a branch_manager/team_leader also carry collections
-- work (telecaller-type or field-agent-type) alongside their management rank.
-- For plain telecaller/field_agent rows, agent_type always mirrors designation.
ALTER TABLE users ADD COLUMN agent_type TEXT;
ALTER TABLE users ADD CONSTRAINT chk_users_agent_type
  CHECK (agent_type IN ('telecaller', 'field_agent') OR agent_type IS NULL);

-- Backfill: mirror agent_type for existing telecaller/field_agent rows only.
-- branch_manager doesn't exist among current users yet (new enum value below),
-- so no branch_manager backfill is needed or possible.
UPDATE users SET agent_type = designation WHERE designation IN ('telecaller', 'field_agent');

-- Widen the designation rank to include branch_manager (sits between
-- operations_manager and team_leader in seniority, but not in the manager_id
-- chain -- see backend/src/routes/employees.ts assertManager()).
ALTER TABLE users DROP CONSTRAINT chk_users_designation;
ALTER TABLE users ADD CONSTRAINT chk_users_designation
  CHECK (designation IN ('agency_admin', 'operations_manager', 'branch_manager', 'team_leader', 'telecaller', 'field_agent'));
