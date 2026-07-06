import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/config/db";
import { hashPassword } from "../src/services/auth-service";

/** Task 5.3: monthly targets — bulk upsert, delete-on-null, Excel import. */
const app = createApp();

const PASSWORD = "Secret@123";
const ADMIN_PHONE = "7930000090";
const AGENT_PHONE = "7930000091";

let agencyId: string;
let branchId: string;
let teamId: string;
let agentId: string;
let adminToken: string;
let agentToken: string;

async function login(phone: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ phone, password: PASSWORD });
  return res.body.access_token;
}

beforeAll(async () => {
  const agency = await pool.query(
    "INSERT INTO agencies (name) VALUES ('Targets Agency') RETURNING id",
  );
  agencyId = agency.rows[0].id;
  const branch = await pool.query(
    "INSERT INTO branches (agency_id, name) VALUES ($1, 'Targets Branch') RETURNING id",
    [agencyId],
  );
  branchId = branch.rows[0].id;
  const team = await pool.query(
    "INSERT INTO teams (branch_id, name) VALUES ($1, 'Targets Team') RETURNING id",
    [branchId],
  );
  teamId = team.rows[0].id;

  const hash = await hashPassword(PASSWORD);
  await pool.query(
    `INSERT INTO users (agency_id, full_name, phone, password_hash, is_agency_admin)
     VALUES ($1, 'Targets Admin', $2, $3, true)`,
    [agencyId, ADMIN_PHONE, hash],
  );
  const agent = await pool.query(
    `INSERT INTO users (agency_id, full_name, phone, password_hash, is_field_agent, team_id)
     VALUES ($1, 'Targets Agent', $2, $3, true, $4) RETURNING id`,
    [agencyId, AGENT_PHONE, hash, teamId],
  );
  agentId = agent.rows[0].id;

  adminToken = await login(ADMIN_PHONE);
  agentToken = await login(AGENT_PHONE);
});

afterAll(async () => {
  await pool.query("DELETE FROM targets WHERE agency_id = $1", [agencyId]);
  await pool.query("DELETE FROM users WHERE agency_id = $1", [agencyId]);
  await pool.query("DELETE FROM teams WHERE id = $1", [teamId]);
  await pool.query("DELETE FROM branches WHERE id = $1", [branchId]);
  await pool.query("DELETE FROM agencies WHERE id = $1", [agencyId]);
  await pool.end();
});

describe("monthly targets", () => {
  it("bulk upsert creates agency + agent scoped targets", async () => {
    const res = await request(app)
      .put("/api/targets/bulk")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        month: "2026-07",
        rows: [
          { metric: "collection", scope_type: "agency", target_amount: 5000000 },
          {
            metric: "resolution",
            scope_type: "agent",
            scope_id: agentId,
            target_amount: 700000,
            target_count: 60,
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.upserted).toBe(2);

    const list = await request(app)
      .get("/api/targets?month=2026-07")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.body.targets).toHaveLength(2);
    const agentRow = list.body.targets.find(
      (t: { scope_type: string }) => t.scope_type === "agent",
    );
    expect(agentRow.scope_name).toBe("Targets Agent");
    expect(Number(agentRow.target_amount)).toBe(700000);
  });

  it("re-sending the same dimension updates instead of duplicating", async () => {
    await request(app)
      .put("/api/targets/bulk")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        month: "2026-07",
        rows: [{ metric: "collection", scope_type: "agency", target_amount: 6000000 }],
      });
    const list = await request(app)
      .get("/api/targets?month=2026-07&metric=collection")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.body.targets).toHaveLength(1);
    expect(Number(list.body.targets[0].target_amount)).toBe(6000000);
  });

  it("null amount and count deletes the row", async () => {
    const res = await request(app)
      .put("/api/targets/bulk")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        month: "2026-07",
        rows: [
          { metric: "collection", scope_type: "agency", target_amount: null, target_count: null },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(1);

    const list = await request(app)
      .get("/api/targets?month=2026-07&metric=collection")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.body.targets).toHaveLength(0);
  });

  it("product/bucket slices are separate rows, not conflicts", async () => {
    const res = await request(app)
      .put("/api/targets/bulk")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        month: "2026-07",
        rows: [
          { metric: "recovery", scope_type: "agency", target_amount: 100000 },
          { metric: "recovery", scope_type: "agency", bucket: "NPA", target_amount: 80000 },
          { metric: "recovery", scope_type: "agency", product: "CVL", target_amount: 50000 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.upserted).toBe(3);
    const list = await request(app)
      .get("/api/targets?month=2026-07&metric=recovery")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.body.targets).toHaveLength(3);
  });

  it("agents cannot read or write targets", async () => {
    const read = await request(app)
      .get("/api/targets?month=2026-07")
      .set("Authorization", `Bearer ${agentToken}`);
    expect(read.status).toBe(403);
    const write = await request(app)
      .put("/api/targets/bulk")
      .set("Authorization", `Bearer ${agentToken}`)
      .send({
        month: "2026-07",
        rows: [{ metric: "collection", scope_type: "agency", target_amount: 1 }],
      });
    expect(write.status).toBe(403);
  });

  it("scope from another agency is rejected", async () => {
    const foreign = await pool.query(
      "INSERT INTO agencies (name) VALUES ('Targets Foreign') RETURNING id",
    );
    const foreignBranch = await pool.query(
      "INSERT INTO branches (agency_id, name) VALUES ($1, 'Foreign Branch') RETURNING id",
      [foreign.rows[0].id],
    );
    const res = await request(app)
      .put("/api/targets/bulk")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        month: "2026-07",
        rows: [
          {
            metric: "collection",
            scope_type: "branch",
            scope_id: foreignBranch.rows[0].id,
            target_amount: 1,
          },
        ],
      });
    expect(res.status).toBe(404);
    await pool.query("DELETE FROM branches WHERE id = $1", [foreignBranch.rows[0].id]);
    await pool.query("DELETE FROM agencies WHERE id = $1", [foreign.rows[0].id]);
  });

  it("Excel import resolves scope names and upserts", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Targets");
    ws.addRow([
      "Month",
      "Metric",
      "Scope Type",
      "Scope Name/Phone",
      "Company",
      "Product",
      "Bucket",
      "Target Amount",
      "Target Count",
    ]);
    ws.addRow(["2026-08", "collection", "agency", "", "", "", "", "9,00,000", ""]);
    ws.addRow(["2026-08", "resolution", "agent", AGENT_PHONE, "", "", "", 250000, 30]);
    ws.addRow(["2026-08", "resolution", "branch", "Targets Branch", "", "", "", 500000, ""]);
    ws.addRow(["2026-08", "resolution", "agent", "0000000000", "", "", "", 1, ""]); // unknown
    ws.addRow(["2026-13", "collection", "agency", "", "", "", "", 1, ""]); // bad month
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const res = await request(app)
      .post("/api/targets/import")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", buffer, "targets.xlsx");
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(3);
    expect(res.body.error_rows).toBe(2);

    const list = await request(app)
      .get("/api/targets?month=2026-08")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.body.targets).toHaveLength(3);
    const agencyRow = list.body.targets.find(
      (t: { scope_type: string }) => t.scope_type === "agency",
    );
    expect(Number(agencyRow.target_amount)).toBe(900000);
  });
});
