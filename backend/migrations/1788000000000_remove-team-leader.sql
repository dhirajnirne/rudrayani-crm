-- Up Migration
-- Phase 2: Remove team_leader as a designation/role entirely. Teams now
-- report directly to their branch's branch_manager -- no intermediary rank.
-- Sequencing matters here (data must be clean before constraints tighten):
--   1) capture the set of team_leader ids before mutating them (needed to
--      correctly repoint manager_id in step 3, since designation itself
--      changes in step 1)
--   2) promote/demote each team_leader (deterministic: promote to
--      branch_manager if their branch has none yet, else demote to
--      field_agent, since a branch can only have one branch_manager)
--   3) archive team_leaders junction table (real org history) before
--      dropping it
--   4) repoint every remaining telecaller/field_agent's manager_id off of
--      a former team_leader onto their branch's branch_manager; abort if
--      any branch with staff still has no branch_manager at this point
--   5) drop team_leaders
--   6) delete team_leader's capability_permissions rows
--   7) grant branch_manager the 4 permissions team_leader had that it
--      didn't (calls.log, payments.record, attendance.punch,
--      reminders.manage) -- branch_manager can do frontline work via
--      agent_type exactly like team_leader could
--   8) tighten chk_users_designation (only valid once every team_leader
--      row above has been reassigned)
--   9) drop is_team_leader (dead column once designation can't be it)

CREATE TEMP TABLE former_team_leaders AS
  SELECT id FROM users WHERE designation = 'team_leader';

DO $$
DECLARE
  tl RECORD;
BEGIN
  FOR tl IN
    SELECT u.id, u.team_id, t.branch_id, b.branch_manager_id
      FROM users u
      LEFT JOIN teams t ON t.id = u.team_id
      LEFT JOIN branches b ON b.id = t.branch_id
     WHERE u.designation = 'team_leader'
  LOOP
    IF tl.branch_id IS NOT NULL AND tl.branch_manager_id IS NULL THEN
      -- Promote: this branch has no manager yet, this TL becomes it.
      UPDATE users
         SET designation = 'branch_manager', agent_type = NULL,
             team_id = NULL, branch_id = NULL, manager_id = NULL
       WHERE id = tl.id;
      UPDATE branches SET branch_manager_id = tl.id WHERE id = tl.branch_id;
    ELSE
      -- Demote: either no team/branch at all, or the branch already has a
      -- manager (one branch_manager per branch) -- keep this person working
      -- as a field_agent in their existing team rather than dropping them.
      -- manager_id gets repointed to the branch's manager in the next step.
      UPDATE users
         SET designation = 'field_agent', agent_type = 'field_agent'
       WHERE id = tl.id;
    END IF;
  END LOOP;
END $$;

-- Archive team_leaders' historical leadership data before dropping the
-- table -- real organizational history with no automatic replacement.
CREATE TABLE IF NOT EXISTS team_leaders_archive AS SELECT * FROM team_leaders WHERE false;
INSERT INTO team_leaders_archive SELECT * FROM team_leaders;

-- Repoint every telecaller/field_agent whose manager_id pointed at a
-- former team_leader onto their branch's branch_manager -- this also
-- covers a *demoted* former team_leader's own manager_id (their id is in
-- former_team_leaders too), since they now need to satisfy the same
-- field_agent-reports-to-branch_manager rule as everyone else. Abort
-- loudly if a branch with staff still has no manager at this point --
-- better to surface a data problem during a controlled migration than
-- leave a dangling manager_id for assertManager() to reject later.
DO $$
DECLARE
  missing_branch_managers INT;
BEGIN
  UPDATE users u
     SET manager_id = b.branch_manager_id
    FROM teams t
    JOIN branches b ON b.id = t.branch_id
   WHERE u.team_id = t.id
     AND u.designation IN ('telecaller', 'field_agent')
     AND (u.manager_id IN (SELECT id FROM former_team_leaders)
          OR u.id IN (SELECT id FROM former_team_leaders));

  SELECT COUNT(*) INTO missing_branch_managers
    FROM users u
    JOIN teams t ON t.id = u.team_id
    JOIN branches b ON b.id = t.branch_id
   WHERE u.designation IN ('telecaller', 'field_agent')
     AND b.branch_manager_id IS NULL;

  IF missing_branch_managers > 0 THEN
    RAISE EXCEPTION 'Migration aborted: % telecaller/field_agent rows are in a branch with no branch_manager. Assign a branch_manager to every branch with staff before rerunning this migration.', missing_branch_managers;
  END IF;
END $$;

DROP TABLE team_leaders;

DELETE FROM capability_permissions WHERE capability = 'team_leader';

INSERT INTO capability_permissions (capability, permission_key) VALUES
    ('branch_manager', 'calls.log'),
    ('branch_manager', 'payments.record'),
    ('branch_manager', 'attendance.punch'),
    ('branch_manager', 'reminders.manage')
ON CONFLICT DO NOTHING;

ALTER TABLE users DROP CONSTRAINT chk_users_designation;
ALTER TABLE users ADD CONSTRAINT chk_users_designation
  CHECK (designation = ANY (ARRAY['agency_admin'::text, 'operations_manager'::text, 'branch_manager'::text, 'telecaller'::text, 'field_agent'::text]));

ALTER TABLE users DROP COLUMN is_team_leader;

-- Down Migration
ALTER TABLE users ADD COLUMN is_team_leader BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users DROP CONSTRAINT chk_users_designation;
ALTER TABLE users ADD CONSTRAINT chk_users_designation
  CHECK (designation = ANY (ARRAY['agency_admin'::text, 'operations_manager'::text, 'branch_manager'::text, 'team_leader'::text, 'telecaller'::text, 'field_agent'::text]));

DELETE FROM capability_permissions WHERE capability = 'branch_manager' AND permission_key IN ('calls.log', 'payments.record', 'attendance.punch', 'reminders.manage');

INSERT INTO capability_permissions (capability, permission_key) VALUES
    ('team_leader', 'customers.view'),
    ('team_leader', 'customers.allocate'),
    ('team_leader', 'employees.view'),
    ('team_leader', 'employees.create'),
    ('team_leader', 'branches.manage'),
    ('team_leader', 'teams.manage'),
    ('team_leader', 'reports.view'),
    ('team_leader', 'reports.view_self'),
    ('team_leader', 'tracking.view'),
    ('team_leader', 'calls.log'),
    ('team_leader', 'payments.record'),
    ('team_leader', 'attendance.punch'),
    ('team_leader', 'reminders.manage')
ON CONFLICT DO NOTHING;

CREATE TABLE team_leaders (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, team_id)
);
CREATE INDEX idx_team_leaders_team_id ON team_leaders(team_id);
INSERT INTO team_leaders SELECT * FROM team_leaders_archive;
-- Note: this down migration restores the schema shape only -- it cannot
-- restore the original designation='team_leader' values on affected users,
-- since the up migration already overwrote them.
