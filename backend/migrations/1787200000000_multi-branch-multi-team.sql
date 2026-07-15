-- Multi-branch assignment for Telecallers
CREATE TABLE IF NOT EXISTS telecaller_branches (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, branch_id)
);
CREATE INDEX idx_telecaller_branches_branch_id ON telecaller_branches(branch_id);

-- Multi-team leadership for Team Leaders
CREATE TABLE IF NOT EXISTS team_leaders (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, team_id)
);
CREATE INDEX idx_team_leaders_team_id ON team_leaders(team_id);

-- Backfill existing assignments
-- Populate team_leaders from current is_team_leader + users.team_id
INSERT INTO team_leaders (user_id, team_id)
SELECT id, team_id FROM users
WHERE is_team_leader = true AND team_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM team_leaders tl WHERE tl.user_id = users.id AND tl.team_id = users.team_id);

-- Populate telecaller_branches from current is_telecaller + users.branch_id
INSERT INTO telecaller_branches (user_id, branch_id)
SELECT id, branch_id FROM users
WHERE is_telecaller = true AND branch_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM telecaller_branches tb WHERE tb.user_id = users.id AND tb.branch_id = users.branch_id);
