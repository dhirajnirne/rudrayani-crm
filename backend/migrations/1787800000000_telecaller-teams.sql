-- Multi-team assignment for telecaller-type work (plain telecallers, or
-- branch_manager/team_leader with agent_type = 'telecaller'). Their work is
-- remote calling, not tied to one team, mirroring the existing multi-branch
-- support in telecaller_branches. Field-agent-type work stays single-team
-- (location-bound) and is unaffected by this table.
CREATE TABLE IF NOT EXISTS telecaller_teams (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, team_id)
);
CREATE INDEX idx_telecaller_teams_team_id ON telecaller_teams(team_id);

-- Backfill from telecallers' current scalar team_id, mirroring how
-- telecaller_branches was backfilled from users.branch_id.
INSERT INTO telecaller_teams (user_id, team_id)
SELECT id, team_id FROM users
WHERE designation = 'telecaller' AND team_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM telecaller_teams tt WHERE tt.user_id = users.id AND tt.team_id = users.team_id);
