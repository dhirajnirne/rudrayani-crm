import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/config/db";
import { hashPassword } from "../src/services/auth-service";

/**
 * Task 5.2: monthly allocation import mode — existing loans are UPDATED (not
 * rejected as duplicates) and every loan in the file gets a per-month
 * snapshot: the "allocated book" the performance dashboard reads.
 */
const app = createApp();

const PASSWORD = "Secret@123";
const ADMIN_PHONE = "7920000080";
const AGENT_PHONE = "7920000081";

let agencyId: string;
let companyId: string;
let branchId: string;
let teamId: string;
let agentId: string;
let token: string;

const MAPPING = {
  Loan: "loan_number",
  Name: "customer_name",
  Bucket: "bucket",
  POS: "due_amount",
  EMI: "emi",
  Agent: "agent_phone",
};

async function buildSheet(rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Allocation");
  ws.addRow(["Loan", "Name", "Bucket", "POS", "EMI", "Agent"]);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function uploadAndCommit(
  buffer: Buffer,
  mode: "new" | "allocation",
  allocationMonth?: string,
) {
  const up = await request(app)
    .post("/api/imports/upload")
    .set("Authorization", `Bearer ${token}`)
    .attach("file", buffer, "allocation.xlsx");
  expect(up.status).toBe(201);
  return request(app)
    .post("/api/imports/commit")
    .set("Authorization", `Bearer ${token}`)
    .send({
      upload_key: up.body.upload_key,
      company_id: companyId,
      column_mapping: MAPPING,
      mode,
      ...(allocationMonth ? { allocation_month: allocationMonth } : {}),
    });
}

beforeAll(async () => {
  const agency = await pool.query(
    "INSERT INTO agencies (name) VALUES ('Alloc Import Agency') RETURNING id",
  );
  agencyId = agency.rows[0].id;
  const company = await pool.query(
    "INSERT INTO companies (agency_id, name) VALUES ($1, 'Alloc NBFC') RETURNING id",
    [agencyId],
  );
  companyId = company.rows[0].id;
  const branch = await pool.query(
    "INSERT INTO branches (agency_id, name) VALUES ($1, 'Alloc Branch') RETURNING id",
    [agencyId],
  );
  branchId = branch.rows[0].id;
  const team = await pool.query(
    "INSERT INTO teams (branch_id, name) VALUES ($1, 'Alloc Team') RETURNING id",
    [branchId],
  );
  teamId = team.rows[0].id;

  const hash = await hashPassword(PASSWORD);
  await pool.query(
    `INSERT INTO users (agency_id, full_name, phone, password_hash, is_agency_admin)
     VALUES ($1, 'Alloc Admin', $2, $3, true)`,
    [agencyId, ADMIN_PHONE, hash],
  );
  const agent = await pool.query(
    `INSERT INTO users (agency_id, full_name, phone, password_hash, is_field_agent, team_id)
     VALUES ($1, 'Alloc Agent', $2, $3, true, $4) RETURNING id`,
    [agencyId, AGENT_PHONE, hash, teamId],
  );
  agentId = agent.rows[0].id;

  const login = await request(app)
    .post("/api/auth/login")
    .send({ phone: ADMIN_PHONE, password: PASSWORD });
  token = login.body.access_token;
});

afterAll(async () => {
  await pool.query(
    `DELETE FROM customer_month_snapshots WHERE company_id = $1`,
    [companyId],
  );
  await pool.query(
    `DELETE FROM allocation_logs WHERE customer_id IN (SELECT id FROM customers WHERE company_id = $1)`,
    [companyId],
  );
  await pool.query("DELETE FROM import_runs WHERE company_id = $1", [companyId]);
  await pool.query("DELETE FROM buckets WHERE company_id = $1", [companyId]);
  await pool.query("DELETE FROM products WHERE company_id = $1", [companyId]);
  await pool.query("DELETE FROM customers WHERE company_id = $1", [companyId]);
  await pool.query("DELETE FROM companies WHERE id = $1", [companyId]);
  await pool.query("DELETE FROM users WHERE agency_id = $1", [agencyId]);
  await pool.query("DELETE FROM teams WHERE id = $1", [teamId]);
  await pool.query("DELETE FROM branches WHERE id = $1", [branchId]);
  await pool.query("DELETE FROM agencies WHERE id = $1", [agencyId]);
  await pool.end();
});

describe("monthly allocation import", () => {
  it("month 1: inserts new loans, assigns agents by phone, writes snapshots", async () => {
    const res = await uploadAndCommit(
      await buildSheet([
        ["AL-001", "Anil", "30", 100000, 5000, AGENT_PHONE],
        ["AL-002", "Sunil", "60", 200000, 8000, AGENT_PHONE],
        ["AL-003", "Kapil", "Current", 50000, 2500, ""],
      ]),
      "allocation",
      "2026-06-01",
    );
    expect(res.status).toBe(201);
    expect(res.body.inserted_rows).toBe(3);
    expect(res.body.updated_rows).toBe(0);
    expect(res.body.unknown_agent_phones).toEqual([]);

    const snaps = await pool.query(
      `SELECT s.bucket, s.due_amount::numeric AS pos, s.assigned_agent_id, c.loan_number
         FROM customer_month_snapshots s JOIN customers c ON c.id = s.customer_id
        WHERE s.company_id = $1 AND s.month = '2026-06-01' ORDER BY c.loan_number`,
      [companyId],
    );
    expect(snaps.rows).toHaveLength(3);
    expect(snaps.rows[0]).toMatchObject({ loan_number: "AL-001", bucket: "30" });
    expect(snaps.rows[0].assigned_agent_id).toBe(agentId);
    expect(Number(snaps.rows[0].pos)).toBe(100000);
  });

  it("month 2: existing loans update in place (bucket moves), snapshot per month", async () => {
    const res = await uploadAndCommit(
      await buildSheet([
        ["AL-001", "Anil", "Current", 95000, 5000, AGENT_PHONE], // normalized
        ["AL-002", "Sunil", "90", 210000, 8000, AGENT_PHONE], // flowed forward
        ["AL-004", "Nikhil", "30", 80000, 4000, AGENT_PHONE], // new loan this month
        // AL-003 missing from month 2's file
      ]),
      "allocation",
      "2026-07-01",
    );
    expect(res.status).toBe(201);
    expect(res.body.inserted_rows).toBe(1);
    expect(res.body.updated_rows).toBe(2);

    // Customer row reflects the new month's file
    const cust = await pool.query(
      `SELECT bucket, due_amount::numeric AS pos FROM customers
        WHERE company_id = $1 AND loan_number = 'AL-001'`,
      [companyId],
    );
    expect(cust.rows[0].bucket).toBe("Current");
    expect(Number(cust.rows[0].pos)).toBe(95000);

    // June snapshot untouched, July snapshot new
    const juneSnap = await pool.query(
      `SELECT s.bucket FROM customer_month_snapshots s JOIN customers c ON c.id = s.customer_id
        WHERE s.company_id = $1 AND c.loan_number = 'AL-001' AND s.month = '2026-06-01'`,
      [companyId],
    );
    expect(juneSnap.rows[0].bucket).toBe("30");
    const julySnaps = await pool.query(
      `SELECT COUNT(*)::int AS n FROM customer_month_snapshots WHERE company_id = $1 AND month = '2026-07-01'`,
      [companyId],
    );
    expect(julySnaps.rows[0].n).toBe(3); // AL-003 has no July snapshot
  });

  it("re-uploading a corrected file for the same month overwrites, not duplicates", async () => {
    const res = await uploadAndCommit(
      await buildSheet([["AL-001", "Anil", "X", 90000, 5000, AGENT_PHONE]]),
      "allocation",
      "2026-07-01",
    );
    expect(res.status).toBe(201);
    const snaps = await pool.query(
      `SELECT s.bucket FROM customer_month_snapshots s JOIN customers c ON c.id = s.customer_id
        WHERE s.company_id = $1 AND c.loan_number = 'AL-001' AND s.month = '2026-07-01'`,
      [companyId],
    );
    expect(snaps.rows).toHaveLength(1);
    expect(snaps.rows[0].bucket).toBe("X");
  });

  it("allocation preview reports updates and loans missing from the file", async () => {
    const up = await request(app)
      .post("/api/imports/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach(
        "file",
        await buildSheet([["AL-001", "Anil", "X", 90000, 5000, ""]]),
        "one-loan.xlsx",
      );
    const res = await request(app)
      .post("/api/imports/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({
        upload_key: up.body.upload_key,
        company_id: companyId,
        column_mapping: MAPPING,
        mode: "allocation",
        allocation_month: "2026-08-01",
      });
    expect(res.status).toBe(200);
    expect(res.body.updates_in_db).toBe(1);
    expect(res.body.duplicates_in_db).toBe(0);
    expect(res.body.missing_from_file).toBe(3); // AL-002/003/004 active but absent
  });

  it("allocation mode requires allocation_month", async () => {
    const res = await uploadAndCommit(
      await buildSheet([["AL-009", "NoMonth", "30", 1000, 100, ""]]),
      "allocation",
    );
    expect(res.status).toBe(400);
  });

  it("unknown agent phones are surfaced, not fatal", async () => {
    const res = await uploadAndCommit(
      await buildSheet([["AL-010", "Ghost Agent", "30", 60000, 3000, "7000000000"]]),
      "allocation",
      "2026-07-01",
    );
    expect(res.status).toBe(201);
    expect(res.body.inserted_rows).toBe(1);
    expect(res.body.unknown_agent_phones).toEqual(["7000000000"]);
    const cust = await pool.query(
      `SELECT assigned_agent_id FROM customers WHERE company_id = $1 AND loan_number = 'AL-010'`,
      [companyId],
    );
    expect(cust.rows[0].assigned_agent_id).toBeNull();
  });

  it("reassignment via allocation import lands in allocation_logs", async () => {
    const logs = await pool.query(
      `SELECT al.reason FROM allocation_logs al
         JOIN customers c ON c.id = al.customer_id
        WHERE c.company_id = $1 AND c.loan_number = 'AL-001' ORDER BY al.created_at`,
      [companyId],
    );
    expect(logs.rows.length).toBeGreaterThanOrEqual(1);
    expect(logs.rows[0].reason).toBe("Assigned by import");
  });

  it("mode=new still rejects duplicate loans instead of updating", async () => {
    const res = await uploadAndCommit(
      await buildSheet([["AL-001", "Anil Again", "90", 999999, 9999, ""]]),
      "new",
    );
    expect(res.status).toBe(201);
    expect(res.body.inserted_rows).toBe(0);
    expect(res.body.duplicate_rows).toBe(1);
    const cust = await pool.query(
      `SELECT bucket FROM customers WHERE company_id = $1 AND loan_number = 'AL-001'`,
      [companyId],
    );
    expect(cust.rows[0].bucket).toBe("X"); // untouched by the rejected new-mode row
  });

  it("imported bucket labels registered in the master with defaults", async () => {
    const res = await request(app)
      .get(`/api/buckets?company_id=${companyId}`)
      .set("Authorization", `Bearer ${token}`);
    const labels = res.body.buckets.map((b: { label: string }) => b.label);
    expect(new Set(labels)).toEqual(new Set(["30", "60", "90", "Current", "X"]));
  });
});
