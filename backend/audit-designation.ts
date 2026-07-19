import { pool } from "./src/config/db";

async function auditDesignation() {
  const client = await pool.connect();
  try {
    console.log("\n=== DESIGNATION AUDIT ===\n");

    // 1. Users with multiple capability flags true
    console.log("1. Users with multiple capability flags true:");
    const multiCapability = await client.query(`
      SELECT
        u.id, u.full_name, u.agency_id,
        is_agency_admin::int + is_operations_manager::int +
        is_telecaller::int + is_field_agent::int as flag_count
      FROM users u
      WHERE is_agency_admin::int + is_operations_manager::int +
            is_telecaller::int + is_field_agent::int > 1
      ORDER BY u.agency_id, flag_count DESC
    `);
    console.log(`   Found: ${multiCapability.rows.length} users`);
    if (multiCapability.rows.length > 0) {
      console.log("   Examples:");
      multiCapability.rows.slice(0, 5).forEach((r) => {
        console.log(`     - ${r.full_name} (agency: ${r.agency_id}, flags: ${r.flag_count})`);
      });
    }

    // 2. Non-admin users with no manager_id
    console.log("\n2. Non-admin users with manager_id IS NULL:");
    const noManager = await client.query(`
      SELECT
        u.id, u.full_name, u.agency_id, u.designation
      FROM users u
      WHERE u.designation IN ('operations_manager', 'branch_manager', 'telecaller', 'field_agent')
        AND manager_id IS NULL
      ORDER BY u.agency_id
    `);
    console.log(`   Found: ${noManager.rows.length} users`);
    if (noManager.rows.length > 0) {
      console.log("   Examples:");
      noManager.rows.slice(0, 5).forEach((r) => {
        console.log(`     - ${r.full_name} (agency: ${r.agency_id}, designation: ${r.designation})`);
      });
    }

    // 3. Invalid manager chains (manager's rank not exactly one above).
    // Phase 2 chain: agency_admin(0) -> operations_manager(1) -> telecaller/
    // field_agent(3), with branch_manager(2) reporting to operations_manager
    // but NOT itself a required manager for anyone (it's reached via scope,
    // not the manager_id chain) -- excluded from this check the same way.
    console.log("\n3. Users with potentially invalid manager chains:");
    const invalidChains = await client.query(`
      WITH user_ranks AS (
        SELECT u.id, u.full_name, u.manager_id, u.designation,
          CASE
            WHEN u.designation = 'agency_admin' THEN 0
            WHEN u.designation = 'operations_manager' THEN 1
            WHEN u.designation = 'branch_manager' THEN 2
            WHEN u.designation IN ('telecaller', 'field_agent') THEN 3
            ELSE 4
          END as rank
        FROM users u
      ),
      manager_ranks AS (
        SELECT u.id as manager_id,
          CASE
            WHEN u.designation = 'agency_admin' THEN 0
            WHEN u.designation = 'operations_manager' THEN 1
            WHEN u.designation = 'branch_manager' THEN 2
            WHEN u.designation IN ('telecaller', 'field_agent') THEN 3
            ELSE 4
          END as manager_rank
        FROM users u
      )
      SELECT ur.id, ur.full_name, ur.designation, ur.rank, mr.manager_rank,
             (ur.rank - mr.manager_rank) as rank_diff
      FROM user_ranks ur
      LEFT JOIN manager_ranks mr ON ur.manager_id = mr.manager_id
      WHERE ur.manager_id IS NOT NULL
        AND ur.designation != 'branch_manager'
        AND (mr.manager_rank IS NULL OR ur.rank - mr.manager_rank != 1)
      ORDER BY ur.rank, rank_diff
    `);
    console.log(`   Found: ${invalidChains.rows.length} users`);
    if (invalidChains.rows.length > 0) {
      console.log("   Examples:");
      invalidChains.rows.slice(0, 5).forEach((r) => {
        console.log(`     - ${r.full_name} (rank: ${r.rank}, manager_rank: ${r.manager_rank}, diff: ${r.rank_diff})`);
      });
    }

    // 4. Branches with staff (telecaller/field_agent) but no branch_manager
    // -- Phase 2's core precondition: this indicates a data problem, since
    // those employees now have no valid manager to report to at all.
    console.log("\n4. Branches with staff but no branch_manager assigned:");
    const unmanagedStaffedBranches = await client.query(`
      SELECT b.id, b.name, b.agency_id, COUNT(u.id)::int AS staff_count
        FROM branches b
        JOIN users u ON u.branch_id = b.id AND u.designation IN ('telecaller', 'field_agent')
       WHERE b.branch_manager_id IS NULL
       GROUP BY b.id, b.name, b.agency_id
       ORDER BY b.agency_id, b.name
    `);
    console.log(`   Found: ${unmanagedStaffedBranches.rows.length} branches`);
    if (unmanagedStaffedBranches.rows.length > 0) {
      console.log("   Examples:");
      unmanagedStaffedBranches.rows.slice(0, 5).forEach((r) => {
        console.log(`     - ${r.name} (agency: ${r.agency_id}, staff: ${r.staff_count})`);
      });
    }

    // Summary by agency
    console.log("\n=== SUMMARY BY AGENCY ===\n");
    const agencies = await client.query(`SELECT DISTINCT agency_id FROM users ORDER BY agency_id`);
    for (const agency of agencies.rows) {
      const agencyId = agency.agency_id;
      const multi = (
        await client.query(
          `SELECT COUNT(*) as cnt FROM users u WHERE agency_id = $1 AND
           is_agency_admin::int + is_operations_manager::int +
           is_telecaller::int + is_field_agent::int > 1`,
          [agencyId]
        )
      ).rows[0].cnt;
      const noMgr = (
        await client.query(
          `SELECT COUNT(*) as cnt FROM users u WHERE agency_id = $1 AND
           u.designation IN ('operations_manager', 'branch_manager', 'telecaller', 'field_agent')
           AND manager_id IS NULL`,
          [agencyId]
        )
      ).rows[0].cnt;
      console.log(`Agency ${agencyId.substring(0, 8)}...:`);
      console.log(`  - Multiple flags: ${multi} users`);
      console.log(`  - No manager: ${noMgr} users`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

auditDesignation().catch(console.error);
