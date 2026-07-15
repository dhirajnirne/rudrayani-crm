import { pool } from "../db";

async function fillEmptyFields() {
  console.log("Starting to fill empty fields for employees...");
  
  // 1. Fetch all agencies
  const { rows: agencies } = await pool.query("SELECT id FROM agencies");
  
  for (const agency of agencies) {
    const agencyId = agency.id;

    // Get an existing branch for the agency
    const { rows: branches } = await pool.query(
      "SELECT id FROM branches WHERE agency_id = $1 LIMIT 1",
      [agencyId]
    );
    const defaultBranchId = branches.length > 0 ? branches[0].id : null;

    // Get an existing team for the agency
    const { rows: teams } = await pool.query(
      "SELECT id FROM teams WHERE agency_id = $1 LIMIT 1",
      [agencyId]
    );
    const defaultTeamId = teams.length > 0 ? teams[0].id : null;

    // Get an existing operations_manager
    const { rows: opsManagers } = await pool.query(
      "SELECT id FROM users WHERE agency_id = $1 AND designation = 'operations_manager' LIMIT 1",
      [agencyId]
    );
    const defaultOpsManagerId = opsManagers.length > 0 ? opsManagers[0].id : null;

    // Get an existing team_leader
    const { rows: teamLeaders } = await pool.query(
      "SELECT id FROM users WHERE agency_id = $1 AND designation = 'team_leader' LIMIT 1",
      [agencyId]
    );
    const defaultTeamLeaderId = teamLeaders.length > 0 ? teamLeaders[0].id : null;

    // Update missing branch_id
    if (defaultBranchId) {
      const res = await pool.query(
        "UPDATE users SET branch_id = $1 WHERE agency_id = $2 AND branch_id IS NULL AND designation != 'admin'",
        [defaultBranchId, agencyId]
      );
      if (res.rowCount && res.rowCount > 0) {
        console.log(`Updated ${res.rowCount} users with branch_id ${defaultBranchId} in agency ${agencyId}`);
      }
    }

    // Update missing team_id
    if (defaultTeamId) {
      const res = await pool.query(
        "UPDATE users SET team_id = $1 WHERE agency_id = $2 AND team_id IS NULL AND designation IN ('telecaller', 'field_agent')",
        [defaultTeamId, agencyId]
      );
      if (res.rowCount && res.rowCount > 0) {
        console.log(`Updated ${res.rowCount} users with team_id ${defaultTeamId} in agency ${agencyId}`);
      }
    }

    // Update missing manager_id for field_agent and telecaller
    if (defaultTeamLeaderId) {
      const res = await pool.query(
        "UPDATE users SET manager_id = $1 WHERE agency_id = $2 AND manager_id IS NULL AND designation IN ('telecaller', 'field_agent')",
        [defaultTeamLeaderId, agencyId]
      );
      if (res.rowCount && res.rowCount > 0) {
        console.log(`Updated ${res.rowCount} users with manager_id ${defaultTeamLeaderId} (Team Leader) in agency ${agencyId}`);
      }
    }

    // Update missing manager_id for team_leader
    if (defaultOpsManagerId) {
      const res = await pool.query(
        "UPDATE users SET manager_id = $1 WHERE agency_id = $2 AND manager_id IS NULL AND designation = 'team_leader'",
        [defaultOpsManagerId, agencyId]
      );
      if (res.rowCount && res.rowCount > 0) {
        console.log(`Updated ${res.rowCount} team leaders with manager_id ${defaultOpsManagerId} (Ops Manager) in agency ${agencyId}`);
      }
    }
  }

  console.log("Finished filling empty fields for employees.");
  process.exit(0);
}

fillEmptyFields().catch((err) => {
  console.error("Error running script:", err);
  process.exit(1);
});
