import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/config/db";
import { hashPassword } from "../src/services/auth-service";
import { monthDays } from "../src/services/report-service";

/**
 * Task 5.5: report engine. Seeds May+June 2026 snapshots so May is classified
 * on bucket TRANSITIONS while June (no July file) falls back to the
 * payments-based proxies. Buckets: Current(0, current) < X(1) < 30(2) <
 * 60(3) < NPA(4, npa).
 */
const app = createApp();

const PASSWORD = "Secret@123";
const ADMIN_PHONE = "7950000020";
const TL_PHONE = "7950000021";
const AGENT_PHONE = "7950000022";
const AGENT2_PHONE = "7950000023";

let agencyId: string;
let companyId: string;
let branchId: string;
let teamId: string;
let team2Id: string;
let agentId: string;
let agent2Id: string;
let adminToken: string;
let tlToken: string;
let agentToken: string;
const customerIds: Record<string, string> = {};

const MAY = "2026-05-01";
const JUNE = "2026-06-01";

async function login(phone: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ phone, password: PASSWORD });
  return res.body.access_token;
}

async function snapshot(
  loan: string,
  month: string,
  bucket: string,
  pos: number,
  emi: number,
  agent: string,
  team: string,
) {
  await pool.query(
    `INSERT INTO customer_month_snapshots
       (customer_id, company_id, month, bucket, due_amount, emi, product,
        assigned_team_id, assigned_agent_id)
     SELECT id, company_id, $2, $3, $4, $5, product, $6, $7 FROM customers WHERE id = $1`,
    [customerIds[loan], month, bucket, pos, emi, team, agent],
  );
}

/** A payment timestamped inside the given IST day. */
async function pay(loan: string, amount: number, istDate: string, byUser: string, deposited = false) {
  await pool.query(
    `INSERT INTO payments (customer_id, collected_by_user_id, amount, paid_at,
                           deposited_at, deposited_by_user_id)
     VALUES ($1, $2, $3, ($4::timestamp AT TIME ZONE 'Asia/Kolkata'),
             CASE WHEN $5 THEN now() END, CASE WHEN $5 THEN $2::uuid END)`,
    [customerIds[loan], byUser, amount, `${istDate} 12:00:00`, deposited],
  );
}

beforeAll(async () => {
  const agency = await pool.query(
    "INSERT INTO agencies (name) VALUES ('Reports Agency') RETURNING id",
  );
  agencyId = agency.rows[0].id;
  const company = await pool.query(
    "INSERT INTO companies (agency_id, name) VALUES ($1, 'Reports NBFC') RETURNING id",
    [agencyId],
  );
  companyId = company.rows[0].id;
  const branch = await pool.query(
    "INSERT INTO branches (agency_id, name) VALUES ($1, 'Reports Branch') RETURNING id",
    [agencyId],
  );
  branchId = branch.rows[0].id;
  const team = await pool.query(
    "INSERT INTO teams (branch_id, name) VALUES ($1, 'Reports Team A') RETURNING id",
    [branchId],
  );
  teamId = team.rows[0].id;
  const team2 = await pool.query(
    "INSERT INTO teams (branch_id, name) VALUES ($1, 'Reports Team B') RETURNING id",
    [branchId],
  );
  team2Id = team2.rows[0].id;

  const hash = await hashPassword(PASSWORD);
  await pool.query(
    `INSERT INTO users (agency_id, full_name, phone, password_hash, is_agency_admin)
     VALUES ($1, 'Reports Admin', $2, $3, true)`,
    [agencyId, ADMIN_PHONE, hash],
  );
  await pool.query(
    `INSERT INTO users (agency_id, branch_id, team_id, full_name, phone, password_hash, is_team_leader)
     VALUES ($1, $2, $3, 'Reports TL', $4, $5, true)`,
    [agencyId, branchId, teamId, TL_PHONE, hash],
  );
  const agent = await pool.query(
    `INSERT INTO users (agency_id, branch_id, team_id, full_name, phone, password_hash, is_field_agent)
     VALUES ($1, $2, $3, 'Reports Agent One', $4, $5, true) RETURNING id`,
    [agencyId, branchId, teamId, AGENT_PHONE, hash],
  );
  agentId = agent.rows[0].id;
  const agent2 = await pool.query(
    `INSERT INTO users (agency_id, branch_id, team_id, full_name, phone, password_hash, is_field_agent)
     VALUES ($1, $2, $3, 'Reports Agent Two', $4, $5, true) RETURNING id`,
    [agencyId, branchId, team2Id, AGENT2_PHONE, hash],
  );
  agent2Id = agent2.rows[0].id;

  // Buckets master with explicit ordering + flags
  const bucketDefs: [string, number, string, boolean][] = [
    ["Current", 0, "normal", true],
    ["X", 1, "normal", false],
    ["30", 2, "normal", false],
    ["60", 3, "normal", false],
    ["NPA", 4, "npa", false],
  ];
  for (const [label, order, category, isCurrent] of bucketDefs) {
    await pool.query(
      `INSERT INTO buckets (company_id, label, sort_order, category, is_current)
       VALUES ($1, $2, $3, $4, $5)`,
      [companyId, label, order, category, isCurrent],
    );
  }

  // Customers (product CVL except RPT-05 = LPL)
  const defs: [string, string][] = [
    ["RPT-01", "CVL"],
    ["RPT-02", "CVL"],
    ["RPT-03", "CVL"],
    ["RPT-04", "CVL"],
    ["RPT-05", "LPL"],
    ["RPT-06", "CVL"],
  ];
  for (const [loan, product] of defs) {
    const { rows } = await pool.query(
      `INSERT INTO customers (company_id, loan_number, customer_name, product, due_amount, emi)
       VALUES ($1, $2, $2, $3, 1, 1) RETURNING id`,
      [companyId, loan, product],
    );
    customerIds[loan] = rows[0].id;
    await pool.query(
      `INSERT INTO products (company_id, raw_label, canonical_label)
       VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [companyId, product],
    );
  }

  // ── MAY (transition basis: June file exists) ─────────────────────────────
  // RPT-01: 30 -> Current  = normalized (and resolved: didn't flow forward)
  // RPT-02: 60 -> 30       = rolled back (and resolved)
  // RPT-03: 30 -> 60       = flowed forward (nothing)
  // RPT-04: 30 -> 30       = held (resolved only)
  // RPT-05: NPA -> NPA     = recovery base; payment in May = recovery MTD
  // RPT-06: 30 -> (absent) = dropped from June file: excluded from resolution
  await snapshot("RPT-01", MAY, "30", 100000, 5000, agentId, teamId);
  await snapshot("RPT-02", MAY, "60", 200000, 8000, agentId, teamId);
  await snapshot("RPT-03", MAY, "30", 150000, 6000, agent2Id, team2Id);
  await snapshot("RPT-04", MAY, "30", 120000, 5000, agent2Id, team2Id);
  await snapshot("RPT-05", MAY, "NPA", 300000, 0, agentId, teamId);
  await snapshot("RPT-06", MAY, "30", 80000, 4000, agentId, teamId);

  await snapshot("RPT-01", JUNE, "Current", 95000, 5000, agentId, teamId);
  await snapshot("RPT-02", JUNE, "30", 190000, 8000, agentId, teamId);
  await snapshot("RPT-03", JUNE, "60", 155000, 6000, agent2Id, team2Id);
  await snapshot("RPT-04", JUNE, "30", 118000, 5000, agent2Id, team2Id);
  await snapshot("RPT-05", JUNE, "NPA", 290000, 0, agentId, teamId);

  // May money: recovery payment on the NPA loan + a normal one (deposited)
  await pay("RPT-05", 10000, "2026-05-10", agentId);
  await pay("RPT-01", 5000, "2026-05-12", agentId, true);
  // IST edge: 2026-05-31 23:30 IST is still May
  await pay("RPT-02", 8000, "2026-05-31", agentId);

  // ── JUNE (payments basis: no July file) ──────────────────────────────────
  // RPT-01 pays its full arrears -> normalized; RPT-02 pays exactly one EMI
  // -> resolved+rolled back; RPT-03 pays less than an EMI -> nothing.
  await pay("RPT-01", 95000, "2026-06-05", agentId, true);
  await pay("RPT-02", 8000, "2026-06-08", agentId);
  await pay("RPT-03", 1000, "2026-06-09", agent2Id);

  // Trail: one call log for RPT-01 in May (IST)
  await pool.query(
    `INSERT INTO call_logs (customer_id, agent_id, remark, created_at)
     VALUES ($1, $2, 'test call', ('2026-05-15 10:00:00'::timestamp AT TIME ZONE 'Asia/Kolkata'))`,
    [customerIds["RPT-01"], agentId],
  );

  // Targets: agency-wide May collection + resolution; agent-level June collection
  await pool.query(
    `INSERT INTO targets (agency_id, month, metric, scope_type, target_amount)
     VALUES ($1, $2, 'collection', 'agency', 50000),
            ($1, $2, 'resolution', 'agency', 500000)`,
    [agencyId, MAY],
  );
  await pool.query(
    `INSERT INTO targets (agency_id, month, metric, scope_type, scope_id, target_amount)
     VALUES ($1, $2, 'collection', 'agent', $3, 120000),
            ($1, $2, 'collection', 'agent', $4, 30000)`,
    [agencyId, JUNE, agentId, agent2Id],
  );

  adminToken = await login(ADMIN_PHONE);
  tlToken = await login(TL_PHONE);
  agentToken = await login(AGENT_PHONE);
});

afterAll(async () => {
  await pool.query("DELETE FROM targets WHERE agency_id = $1", [agencyId]);
  await pool.query("DELETE FROM customer_month_snapshots WHERE company_id = $1", [companyId]);
  await pool.query(
    `DELETE FROM call_logs WHERE customer_id IN (SELECT id FROM customers WHERE company_id = $1)`,
    [companyId],
  );
  await pool.query(
    `DELETE FROM payments WHERE customer_id IN (SELECT id FROM customers WHERE company_id = $1)`,
    [companyId],
  );
  await pool.query("DELETE FROM buckets WHERE company_id = $1", [companyId]);
  await pool.query("DELETE FROM products WHERE company_id = $1", [companyId]);
  await pool.query("DELETE FROM customers WHERE company_id = $1", [companyId]);
  await pool.query("DELETE FROM companies WHERE id = $1", [companyId]);
  await pool.query("DELETE FROM users WHERE agency_id = $1", [agencyId]);
  await pool.query("DELETE FROM teams WHERE id IN ($1, $2)", [teamId, team2Id]);
  await pool.query("DELETE FROM branches WHERE id = $1", [branchId]);
  await pool.query("DELETE FROM agencies WHERE id = $1", [agencyId]);
  await pool.end();
});

describe("report engine", () => {
  it("May classifies on bucket transitions (June file exists)", async () => {
    const res = await request(app)
      .get("/api/reports/dashboard?month=2026-05")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    expect(res.body.allocated.count).toBe(6);
    expect(res.body.allocated.amount).toBe(950000);

    const m = res.body.metrics;
    expect(m.resolution.basis).toBe("transition");
    // resolved: RPT-01 (30->Current), RPT-02 (60->30), RPT-04 (30->30), RPT-05 (NPA->NPA)
    // not: RPT-03 (flowed), RPT-06 (dropped, excluded)
    expect(m.resolution.mtd_count).toBe(4);
    expect(m.resolution.mtd_amount).toBe(100000 + 200000 + 120000 + 300000);
    expect(m.normalization.mtd_count).toBe(1); // RPT-01
    expect(m.rollback.mtd_count).toBe(1); // RPT-02
    // recovery: base = NPA slice, MTD = ₹ paid on NPA accounts in May
    expect(m.recovery.allocated_amount).toBe(300000);
    expect(m.recovery.mtd_amount).toBe(10000);
    expect(m.recovery.basis).toBe("payments");
  });

  it("May collection, targets, deposits and trail line up", async () => {
    const res = await request(app)
      .get("/api/reports/dashboard?month=2026-05")
      .set("Authorization", `Bearer ${adminToken}`);
    // 10000 + 5000 + 8000 — the 31 May IST payment counts in May
    expect(res.body.collection.mtd_amount).toBe(23000);
    expect(res.body.collection.target_amount).toBe(50000);
    expect(res.body.metrics.resolution.target_amount).toBe(500000);
    expect(res.body.metrics.resolution.target_pct).toBeCloseTo((500000 / 950000) * 100, 1);
    expect(res.body.deposits.collected).toBe(23000);
    expect(res.body.deposits.deposited).toBe(5000);
    expect(res.body.deposits.pending).toBe(18000);
    expect(res.body.trail.uploaded_count).toBe(1);
    expect(res.body.days).toEqual({ in_month: 31, elapsed: 31, left: 0 });
  });

  it("June falls back to payment proxies (no July file)", async () => {
    const res = await request(app)
      .get("/api/reports/dashboard?month=2026-06")
      .set("Authorization", `Bearer ${adminToken}`);
    const m = res.body.metrics;
    expect(m.resolution.basis).toBe("payments");
    expect(res.body.allocated.count).toBe(5);
    // paid >= 1 EMI: RPT-01 (95000 >= 5000), RPT-02 (8000 >= 8000). RPT-03 paid 1000 < 6000.
    expect(m.resolution.mtd_count).toBe(2);
    // normalized: RPT-01 paid its full due (95000)
    expect(m.normalization.mtd_count).toBe(1);
    // rolled back: RPT-02 (>= EMI, < full due)
    expect(m.rollback.mtd_count).toBe(1);
  });

  it("filters slice the book (product, bucket, agent)", async () => {
    const byProduct = await request(app)
      .get("/api/reports/dashboard?month=2026-05&product=LPL")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(byProduct.body.allocated.count).toBe(1); // RPT-05

    const byBucket = await request(app)
      .get("/api/reports/dashboard?month=2026-05&bucket=30")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(byBucket.body.allocated.count).toBe(4); // RPT-01/03/04/06

    const byAgent = await request(app)
      .get(`/api/reports/dashboard?month=2026-05&agent_id=${agent2Id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(byAgent.body.allocated.count).toBe(2); // RPT-03/04
  });

  it("agency target falls back to the sum of agent targets", async () => {
    const res = await request(app)
      .get("/api/reports/dashboard?month=2026-06")
      .set("Authorization", `Bearer ${adminToken}`);
    // No agency-level June collection target -> Σ agent targets 120000 + 30000
    expect(res.body.collection.target_amount).toBe(150000);
  });

  it("TL is clamped to their team", async () => {
    const res = await request(app)
      .get("/api/reports/dashboard?month=2026-05")
      .set("Authorization", `Bearer ${tlToken}`);
    expect(res.status).toBe(200);
    expect(res.body.scope.clamped_to).toBe("team");
    // Team A snapshots: RPT-01, RPT-02, RPT-05, RPT-06
    expect(res.body.allocated.count).toBe(4);

    const foreign = await request(app)
      .get(`/api/reports/dashboard?month=2026-05&team_id=${team2Id}`)
      .set("Authorization", `Bearer ${tlToken}`);
    expect(foreign.status).toBe(403);
  });

  it("an agent sees only their own numbers and cannot widen", async () => {
    const res = await request(app)
      .get("/api/reports/dashboard?month=2026-06")
      .set("Authorization", `Bearer ${agentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.scope.clamped_to).toBe("self");
    expect(res.body.allocated.count).toBe(3); // June: RPT-01/02/05
    expect(res.body.collection.target_amount).toBe(120000); // own target

    const widen = await request(app)
      .get(`/api/reports/dashboard?month=2026-06&agent_id=${agent2Id}`)
      .set("Authorization", `Bearer ${agentToken}`);
    expect(widen.status).toBe(403);
  });

  it("overview returns monthly collection points", async () => {
    const res = await request(app)
      .get("/api/reports/overview?months=all")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const may = res.body.points.find((p: { month: string }) => p.month === "2026-05");
    const june = res.body.points.find((p: { month: string }) => p.month === "2026-06");
    expect(may.collected).toBe(23000);
    expect(june.collected).toBe(104000);
    expect(res.body.total).toBe(127000);
  });

  it("agent breakdown attributes the book to the snapshot agent", async () => {
    const res = await request(app)
      .get("/api/reports/agents?month=2026-05")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const one = res.body.rows.find((r: { agent_id: string }) => r.agent_id === agentId);
    const two = res.body.rows.find((r: { agent_id: string }) => r.agent_id === agent2Id);
    expect(one.allocated_count).toBe(4);
    expect(two.allocated_count).toBe(2);
    expect(one.collected_amount).toBe(23000); // all May money collected by agent one
  });

  it("export streams a two-sheet xlsx honoring filters", async () => {
    const res = await request(app)
      .get("/api/reports/export?month=2026-05&product=LPL")
      .set("Authorization", `Bearer ${adminToken}`)
      .buffer()
      .parse((res2, cb) => {
        const chunks: Buffer[] = [];
        res2.on("data", (c: Buffer) => chunks.push(c));
        res2.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(res.headers["content-disposition"]).toContain("dashboard-2026-05.xlsx");
    expect((res.body as Buffer).length).toBeGreaterThan(1000);
  });

  it("monthDays handles past, current and future months in IST", () => {
    expect(monthDays("2026-05", new Date("2026-07-06T12:00:00Z"))).toEqual({
      in_month: 31,
      elapsed: 31,
      left: 0,
    });
    expect(monthDays("2026-08", new Date("2026-07-06T12:00:00Z"))).toEqual({
      in_month: 31,
      elapsed: 0,
      left: 31,
    });
    const current = monthDays("2026-07", new Date("2026-07-06T12:00:00Z"));
    expect(current.in_month).toBe(31);
    expect(current.elapsed).toBe(6);
    expect(current.left).toBe(25);
  });
});
