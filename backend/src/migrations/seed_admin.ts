/**
 * Bootstrap: creates (or resets the password of) the Agency Admin user.
 * There is exactly one Agency Admin per agency (build brief Section 3).
 *
 * Usage:
 *   npm run seed:admin -- <agency_id> <phone> <password> [full name]
 */
import { pool } from "../config/db";
import { hashPassword } from "../services/auth-service";

async function run(): Promise<void> {
  const [agencyId, phone, password, fullName = "Agency Admin"] = process.argv.slice(2);
  if (!agencyId || !phone || !password) {
    console.error("Usage: npm run seed:admin -- <agency_id> <phone> <password> [full name]");
    process.exit(1);
  }

  const existingAdmin = await pool.query(
    "SELECT id, phone FROM users WHERE agency_id = $1 AND is_agency_admin = true",
    [agencyId],
  );
  if (existingAdmin.rows.length > 0 && existingAdmin.rows[0].phone !== phone) {
    console.error(
      `This agency already has an Agency Admin (phone ${existingAdmin.rows[0].phone}). ` +
        "There is exactly one Agency Admin per agency.",
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const { rows } = await pool.query(
    `INSERT INTO users (agency_id, full_name, phone, password_hash, is_agency_admin)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (phone) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, is_agency_admin = true
     RETURNING id`,
    [agencyId, fullName, phone, passwordHash],
  );
  console.log(`Agency Admin ready: user id ${rows[0].id} (phone ${phone})`);
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
