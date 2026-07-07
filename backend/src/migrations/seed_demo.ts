/**
 * Dev-only: creates one test user per role so every flow can be exercised
 * (mobile + web) with the credentials in TEST_CREDENTIALS.md, plus a demo
 * company/book that exercises the Phase 7 allocation lifecycle end-to-end:
 * a first-of-month import, a mid-month refresh that leaves additions/
 * removals pending review, canonical bucket mappings, a payment-driven
 * bucket movement event, and one already-recalled customer. Idempotent —
 * upserts by phone/loan number, safe to re-run.
 *
 * Usage: npm run seed:demo [-- <password>]   (default Admin@1234)
 *
 * Requires an agency to exist (run seed:admin first).
 */
import { pool } from "../config/db";
import { hashPassword } from "../services/auth-service";
import { commitImport, type ColumnMapping, type ParsedSheet } from "../services/import-service";
import { detectPaymentNormalization } from "../services/bucket-movement-service";

const USERS = [
  { phone: "8888888801", name: "Priya Sharma (Telecaller)", flag: "is_telecaller", team: true },
  { phone: "8888888802", name: "Rahul Verma (Field Agent)", flag: "is_field_agent", team: true },
  { phone: "8888888803", name: "Sneha Patil (Team Leader)", flag: "is_team_leader", team: true },
  { phone: "8888888804", name: "Amit Kulkarni (Ops Manager)", flag: "is_operations_manager", team: false },
] as const;

const MAPPING: ColumnMapping = {
  Loan: "loan_number",
  Name: "customer_name",
  Bucket: "bucket",
  POS: "due_amount",
  EMI: "emi",
  Agent: "agent_phone",
};

/** Builds a ParsedSheet by hand -- commitImport only needs {columns, rows}, no xlsx round-trip required. */
function sheet(rows: (string | number)[][]): ParsedSheet {
  const columns = ["Loan", "Name", "Bucket", "POS", "EMI", "Agent"];
  return {
    columns,
    rows: rows.map((r, i) => {
      const record: Record<string, string> = { __excelRow: String(i + 2) };
      columns.forEach((c, idx) => (record[c] = String(r[idx] ?? "")));
      return record;
    }),
  };
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

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
  let adminId: string | null = null;
  let telecallerId: string | null = null;
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
    if (user.flag === "is_telecaller") telecallerId = rows[0].id;
  }
  const { rows: admins } = await pool.query(
    "SELECT id FROM users WHERE agency_id = $1 AND is_agency_admin = true LIMIT 1",
    [agencyId],
  );
  adminId = admins[0]?.id ?? null;
  if (!adminId) {
    console.error("No agency admin found — run seed:admin first.");
    process.exit(1);
  }

  // ── Demo company + allocation lifecycle (Phase 7) ────────────────────────
  // companies has no unique constraint on (agency_id, name) -- unlike the
  // branches/teams inserts above, ON CONFLICT DO NOTHING would silently never
  // match and create a fresh duplicate company on every re-run. Look up
  // first, insert only if genuinely missing.
  const { rows: existingCompanies } = await pool.query(
    "SELECT id FROM companies WHERE agency_id = $1 AND name = 'Demo Finance Co' ORDER BY created_at LIMIT 1",
    [agencyId],
  );
  let companyId: string;
  if (existingCompanies[0]) {
    companyId = existingCompanies[0].id;
  } else {
    const { rows } = await pool.query(
      "INSERT INTO companies (agency_id, name) VALUES ($1, 'Demo Finance Co') RETURNING id",
      [agencyId],
    );
    companyId = rows[0].id;
  }

  const month = currentMonth();
  const alreadySeeded = await pool.query(
    "SELECT 1 FROM import_runs WHERE company_id = $1 AND mode = 'allocation' AND allocation_month = $2",
    [companyId, month],
  );

  if (alreadySeeded.rows.length === 0) {
    // First-of-month import: additions insert directly (expected new book).
    await commitImport({
      companyId,
      templateId: null,
      uploadedBy: adminId,
      fileName: "demo-allocation-month1.xlsx",
      sheet: sheet([
        ["DEMO-001", "Asha Kulkarni", "X", 20000, 2000, "8888888801"],
        ["DEMO-002", "Vikram Rao", "1", 30000, 3000, "8888888801"],
        ["DEMO-003", "Meera Nair", "1", 40000, 4000, "8888888801"],
        ["DEMO-004", "Sanjay Iyer", "2", 25000, 2500, "8888888801"],
        ["DEMO-005", "Farida Khan", "2", 60000, 6000, ""],
      ]),
      mapping: MAPPING,
      mode: "allocation",
      allocationMonth: month,
    });

    // Mid-month refresh: DEMO-004 drops off (-> pending removal), DEMO-006 is
    // brand new (-> pending addition). Left PENDING on purpose so the Import
    // Review page has something to demonstrate.
    await commitImport({
      companyId,
      templateId: null,
      uploadedBy: adminId,
      fileName: "demo-allocation-month1-refresh.xlsx",
      sheet: sheet([
        ["DEMO-001", "Asha Kulkarni", "X", 20000, 2000, "8888888801"],
        ["DEMO-002", "Vikram Rao", "1", 30000, 3000, "8888888801"],
        ["DEMO-003", "Meera Nair", "1", 40000, 4000, "8888888801"],
        ["DEMO-005", "Farida Khan", "2", 60000, 6000, ""],
        ["DEMO-006", "Nikhil Deshpande", "1", 35000, 3500, ""],
      ]),
      mapping: MAPPING,
      mode: "allocation",
      allocationMonth: month,
    });
    console.log(`  Demo allocation seeded for ${month} — 2 items pending in Import Review.`);

    // Canonical bucket mappings (0 = X/current, 1 = 30 DPD, 2 = 60 DPD).
    await pool.query(
      `UPDATE buckets SET canonical_bucket = 0, is_current = true WHERE company_id = $1 AND label = 'X'`,
      [companyId],
    );
    await pool.query(
      `UPDATE buckets SET canonical_bucket = 1 WHERE company_id = $1 AND label = '1'`,
      [companyId],
    );
    await pool.query(
      `UPDATE buckets SET canonical_bucket = 2 WHERE company_id = $1 AND label = '2'`,
      [companyId],
    );

    // A separate, already-recalled customer (independent of the pending
    // review item) so Customers/Reports show recalled history too.
    await pool.query(
      `INSERT INTO customers (company_id, loan_number, customer_name, bucket, due_amount, emi, status, recalled_at)
       VALUES ($1, 'DEMO-000', 'Recalled Example', '1', 15000, 1500, 'recalled', now())
       ON CONFLICT (company_id, loan_number) DO NOTHING`,
      [companyId],
    );

    // Payment-driven bucket movement: DEMO-002 (bucket "1", emi 3000) pays a
    // full EMI -- clears its arrears per the canonical mapping above.
    const demo002 = await pool.query(
      `SELECT id FROM customers WHERE company_id = $1 AND loan_number = 'DEMO-002'`,
      [companyId],
    );
    if (demo002.rows[0] && telecallerId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const payment = await client.query(
          `INSERT INTO payments (customer_id, collected_by_user_id, amount, mode)
           VALUES ($1, $2, 3000, 'cash') RETURNING id`,
          [demo002.rows[0].id, telecallerId],
        );
        await detectPaymentNormalization(client, demo002.rows[0].id, payment.rows[0].id);
        await client.query("COMMIT");
        console.log("  Payment-driven bucket movement seeded for DEMO-002.");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
  } else {
    console.log(`  Demo allocation for ${month} already seeded — skipping (idempotent).`);
  }

  console.log(`\nAll demo users ready on agency "${agencies[0].name}" (password: ${password}).`);
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
