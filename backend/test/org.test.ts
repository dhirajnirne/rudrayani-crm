import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/config/db";
import { hashPassword } from "../src/services/auth-service";

// Integration tests: require the Postgres container running with migrations applied.
const app = createApp();

const PASSWORD = "Secret@123";
const ADMIN_PHONE = "7100000001";
const OPS_PHONE = "7100000002";
const AGENT_PHONE = "7100000003";

let agencyId: string;
let adminToken: string;
let opsToken: string;

async function login(phone: string, password = PASSWORD): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ phone, password });
  expect(res.status).toBe(200);
  return res.body.access_token as string;
}

beforeAll(async () => {
  const agency = await pool.query(
    "INSERT INTO agencies (name) VALUES ('Test Agency (org.test)') RETURNING id",
  );
  agencyId = agency.rows[0].id;
  const hash = await hashPassword(PASSWORD);
  await pool.query(
    `INSERT INTO users (agency_id, full_name, phone, password_hash, is_agency_admin)
     VALUES ($1, 'Org Admin', $2, $3, true)`,
    [agencyId, ADMIN_PHONE, hash],
  );
  adminToken = await login(ADMIN_PHONE);
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE agency_id = $1", [agencyId]);
  await pool.query("DELETE FROM teams WHERE branch_id IN (SELECT id FROM branches WHERE agency_id = $1)", [agencyId]);
  await pool.query("DELETE FROM branches WHERE agency_id = $1", [agencyId]);
  await pool.query("DELETE FROM companies WHERE agency_id = $1", [agencyId]);
  await pool.query("DELETE FROM agencies WHERE id = $1", [agencyId]);
  await pool.end();
});

describe("Org structure", () => {
  let branchId: string;
  let teamId: string;

  it("admin creates a branch, a team in it, and a company", async () => {
    const branch = await request(app)
      .post("/api/branches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Sangli" });
    expect(branch.status).toBe(201);
    branchId = branch.body.branch.id;

    const team = await request(app)
      .post("/api/teams")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Team A", branch_id: branchId });
    expect(team.status).toBe(201);
    teamId = team.body.team.id;

    const company = await request(app)
      .post("/api/companies")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Hero FinCorp" });
    expect(company.status).toBe(201);
  });

  it("rejects a team in a branch that is not in the caller's agency", async () => {
    const res = await request(app)
      .post("/api/teams")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Ghost Team", branch_id: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(400);
  });

  it("admin creates an Operations Manager", async () => {
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        full_name: "Ops Manager",
        phone: OPS_PHONE,
        password: PASSWORD,
        branch_id: branchId,
        capabilities: { is_operations_manager: true },
      });
    expect(res.status).toBe(201);
    expect(res.body.employee.capabilities).toContain("operations_manager");
    opsToken = await login(OPS_PHONE);
  });

  it("ops manager can create a field agent (with team assignment)", async () => {
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${opsToken}`)
      .send({
        full_name: "Field Agent",
        phone: AGENT_PHONE,
        password: PASSWORD,
        branch_id: branchId,
        team_id: teamId,
        capabilities: { is_field_agent: true, is_telecaller: true },
      });
    expect(res.status).toBe(201);
    expect(res.body.employee.capabilities).toEqual(
      expect.arrayContaining(["field_agent", "telecaller"]),
    );
  });

  it("ops manager CANNOT create another Operations Manager (brief §3)", async () => {
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${opsToken}`)
      .send({
        full_name: "Sneaky Ops",
        phone: "7100000009",
        password: PASSWORD,
        capabilities: { is_operations_manager: true },
      });
    expect(res.status).toBe(403);
  });

  it("ops manager CANNOT grant Operations Manager by editing either", async () => {
    const list = await request(app)
      .get(`/api/employees?q=${AGENT_PHONE}`)
      .set("Authorization", `Bearer ${opsToken}`);
    const agentId = list.body.employees[0].id;

    const res = await request(app)
      .patch(`/api/employees/${agentId}`)
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ capabilities: { is_operations_manager: true } });
    expect(res.status).toBe(403);

    // ...but toggling Team Leader (a designation, brief §3) is allowed.
    const tl = await request(app)
      .patch(`/api/employees/${agentId}`)
      .set("Authorization", `Bearer ${opsToken}`)
      .send({ capabilities: { is_team_leader: true } });
    expect(tl.status).toBe(200);
    expect(tl.body.employee.capabilities).toContain("team_leader");
  });

  it("an agent has no permission to create employees", async () => {
    const agentToken = await login(AGENT_PHONE);
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${agentToken}`)
      .send({ full_name: "X", phone: "7100000010", password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it("deactivating an employee kills their access immediately", async () => {
    const agentToken = await login(AGENT_PHONE);
    const list = await request(app)
      .get(`/api/employees?q=${AGENT_PHONE}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const agentId = list.body.employees[0].id;

    const res = await request(app)
      .patch(`/api/employees/${agentId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ is_active: false });
    expect(res.status).toBe(200);

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${agentToken}`);
    expect(me.status).toBe(401);

    const relogin = await request(app)
      .post("/api/auth/login")
      .send({ phone: AGENT_PHONE, password: PASSWORD });
    expect(relogin.status).toBe(401);
  });

  it("duplicate phone returns 409, not a 500", async () => {
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ full_name: "Dup", phone: OPS_PHONE, password: PASSWORD });
    expect(res.status).toBe(409);
  });
});
