-- Add designation column to users table (authoritative rank field)
ALTER TABLE users ADD COLUMN designation TEXT;

-- Backfill designation based on capability precedence
-- Precedence: agency_admin > operations_manager > team_leader > telecaller > field_agent
UPDATE users
SET designation = CASE
  WHEN is_agency_admin THEN 'agency_admin'
  WHEN is_operations_manager THEN 'operations_manager'
  WHEN is_team_leader THEN 'team_leader'
  WHEN is_telecaller THEN 'telecaller'
  WHEN is_field_agent THEN 'field_agent'
  ELSE NULL
END;

-- Verify no NULLs remain (abort if any user has zero booleans true)
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM users WHERE designation IS NULL) > 0 THEN
    RAISE EXCEPTION 'Backfill failed: % users have no designation (no capability flags true)',
      (SELECT COUNT(*) FROM users WHERE designation IS NULL);
  END IF;
END $$;

-- Make the column NOT NULL
ALTER TABLE users ALTER COLUMN designation SET NOT NULL;

-- Add constraint
ALTER TABLE users ADD CONSTRAINT chk_users_designation
  CHECK (designation IN ('agency_admin', 'operations_manager', 'team_leader', 'telecaller', 'field_agent'));

-- Add index for fast lookups
CREATE INDEX idx_users_designation ON users (designation);
