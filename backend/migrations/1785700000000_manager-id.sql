-- Up Migration

-- Owner feedback round, Phase 7: employees had no way to express "who does
-- this person report to". Add a self-referential manager_id so the new
-- org-chart page (GET /api/employees/org-hierarchy) can render each
-- branch/team as a forest of manager -> report edges. Informational only --
-- this does not affect permissions or the branch/team scoping already used
-- for allocation (brief: manager_id is not a permission concept).
ALTER TABLE users ADD COLUMN manager_id UUID REFERENCES users(id);
CREATE INDEX idx_users_manager_id ON users (manager_id);

-- Down Migration
DROP INDEX IF EXISTS idx_users_manager_id;
ALTER TABLE users DROP COLUMN IF EXISTS manager_id;
