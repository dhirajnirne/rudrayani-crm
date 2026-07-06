/**
 * Dev-only: creates one test user per role so every flow can be exercised
 * (mobile + web) with the credentials in TEST_CREDENTIALS.md. Idempotent —
 * upserts by phone, resetting the password each run.
 *
 * Usage: npm run seed:demo [-- <password>]   (default Admin@1234)
 *
 * Requires an agency to exist (run seed:admin first).
 */
import { pool } from "../config/db";
import { hashPassword } from "../services/auth-service";

const USERS = [
  { phone: "8888888801", name: "Priya Sharma (Telecaller)", flag: "is_telecaller", team: true },
  { phone: "8888888802", name: "Rahul Verma (Field Agent)", flag: "is_field_agent", team: true },
  { phone: "8888888803", name: "Sneha Patil (Team Leader)", flag: "is_team_leader", team: true },
  { phone: "8888888804", name: "Amit Kulkarni (Ops Manager)", flag: "is_operations_manager", team: false },
] as const;

async function run(): Promise<void> {
  const password = process.argv[2] ?? "Admin@1234";

  const { rows: agencies } = await pool.query(
    "SELECT id, name FROM agencies ORDER BY created_at LIMIT 1",
  );
  if (!agencies[0]) {
    console.error("No agency found — run seed:admin first.");
    process.exit(1);
  }
  const agencyId = agencies[0].id as string;

  // Demo branch + team so the TL scope and branch-level targets have a home.
  const { rows: branches } = await pool.query(
    `INSERT INTO branches (agency_id, name) VALUES ($1, 'Demo Branch')
     ON CONFLICT DO NOTHING RETURNING id`,
    [agencyId],
  );
  const branchId =
    branches[0]?.id ??
    (
      await pool.query("SELECT id FROM branches WHERE agency_id = $1 AND name = 'Demo Branch'", [
        agencyId,
      ])
    ).rows[0].id;

  const { rows: teams } = await pool.query(
    `INSERT INTO teams (branch_id, name) VALUES ($1, 'Demo Team')
     ON CONFLICT DO NOTHING RETURNING id`,
    [branchId],
  );
  const teamId =
    teams[0]?.id ??
    (
      await pool.query("SELECT id FROM teams WHERE branch_id = $1 AND name = 'Demo Team'", [
        branchId,
      ])
    ).rows[0].id;

  const hash = await hashPassword(password);
  for (const user of USERS) {
    const { rows } = await pool.query(
      `INSERT INTO users (agency_id, branch_id, team_id, full_name, phone, password_hash, ${user.flag})
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (phone) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             ${user.flag} = true,
             is_active = true,
             branch_id = EXCLUDED.branch_id,
             team_id = EXCLUDED.team_id,
             failed_login_attempts = 0,
             locked_until = NULL
       RETURNING id`,
      [agencyId, branchId, user.team ? teamId : null, user.name, user.phone, hash],
    );
    console.log(`  ${user.name.padEnd(32)} phone ${user.phone}  id ${rows[0].id}`);
  }
  console.log(`\nAll demo users ready on agency "${agencies[0].name}" (password: ${password}).`);
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
