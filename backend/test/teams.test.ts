import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/config/db";
import { hashPassword } from "../src/services/auth-service";

/**
 * RBAC gap: teams.manage is granted to branch_manager (Phase 2), but
 * POST /teams and PATCH /teams/:id only used assertBranchInAgency() --
 * agency membership, not "is this the caller's own branch" -- so a
 * branch_manager could create or rename/move a team under ANY branch in the
 * agency, not just their own.
 */
const app = createApp();

const PASSWORD = "Secret@123";
const ADMIN_PHONE = "7970000040";
const BM_A_PHONE = "7970000041";
const BM_B_PHONE = "7970000042";

let agencyId: string;
let branchAId: string;
let branchBId: string;
let teamAId: string;
let teamBId: string;
let adminToken: string;
let bmAToken: string;

async function login(phone: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ phone, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.access_token as string;
}

beforeAll(async () => {
  const agency = await pool.query(
    "INSERT INTO agencies (name) VALUES ('Teams RBAC Agency') RETURNING id",
  );
  agencyId = agency.rows[0].id;

  const branchA = await pool.query(
    "INSERT INTO branches (agency_id, name) VALUES ($1, 'Teams Branch A') RETURNING id",
    [agencyId],
  );
  branchAId = branchA.rows[0].id;
  const branchB = await pool.query(
    "INSERT INTO branches (agency_id, name) VALUES ($1, 'Teams Branch B') RETURNING id",
    [agencyId],
  );
  branchBId = branchB.rows[0].id;

  const teamA = await pool.query(
    "INSERT INTO teams (branch_id, name) VALUES ($1, 'Branch A Team') RETURNING id",
    [branchAId],
  );
  teamAId = teamA.rows[0].id;
  const teamB = await pool.query(
    "INSERT INTO teams (branch_id, name) VALUES ($1, 'Branch B Team') RETURNING id",
    [branchBId],
  );
  teamBId = teamB.rows[0].id;

  const hash = await hashPassword(PASSWORD);
  await pool.query(
    `INSERT INTO users (agency_id, full_name, phone, password_hash, is_agency_admin, designation)
     VALUES ($1, 'Teams RBAC Admin', $2, $3, true, 'agency_admin')`,
    [agencyId, ADMIN_PHONE, hash],
  );

  const bmA = await pool.query(
    `INSERT INTO users (agency_id, full_name, phone, password_hash, designation)
     VALUES ($1, 'Branch A BM', $2, $3, 'branch_manager') RETURNING id`,
    [agencyId, BM_A_PHONE, hash],
  );
  await pool.query("UPDATE branches SET branch_manager_id = $1 WHERE id = $2", [
    bmA.rows[0].id,
    branchAId,
  ]);
  const bmB = await pool.query(
    `INSERT INTO users (agency_id, full_name, phone, password_hash, designation)
     VALUES ($1, 'Branch B BM', $2, $3, 'branch_manager') RETURNING id`,
    [agencyId, BM_B_PHONE, hash],
  );
  await pool.query("UPDATE branches SET branch_manager_id = $1 WHERE id = $2", [
    bmB.rows[0].id,
    branchBId,
  ]);

  adminToken = await login(ADMIN_PHONE);
  bmAToken = await login(BM_A_PHONE);
});

afterAll(async () => {
  await pool.query("UPDATE branches SET branch_manager_id = NULL WHERE agency_id = $1", [agencyId]);
  await pool.query("DELETE FROM users WHERE agency_id = $1", [agencyId]);
  await pool.query("DELETE FROM teams WHERE branch_id IN ($1, $2)", [branchAId, branchBId]);
  await pool.query("DELETE FROM branches WHERE agency_id = $1", [agencyId]);
  await pool.query("DELETE FROM agencies WHERE id = $1", [agencyId]);
  await pool.end();
});

describe("POST /teams", () => {
  it("lets a branch_manager create a team under their own branch", async () => {
    const res = await request(app)
      .post("/api/teams")
      .set("Authorization", `Bearer ${bmAToken}`)
      .send({ name: "New A Team", branch_id: branchAId });
    expect(res.status).toBe(201);
    expect(res.body.team.branch_id).toBe(branchAId);
    await pool.query("DELETE FROM teams WHERE id = $1", [res.body.team.id]);
  });

  it("403s a branch_manager creating a team under another branch", async () => {
    const res = await request(app)
      .post("/api/teams")
      .set("Authorization", `Bearer ${bmAToken}`)
      .send({ name: "Sneaky Team", branch_id: branchBId });
    expect(res.status).toBe(403);
    const check = await pool.query("SELECT 1 FROM teams WHERE name = 'Sneaky Team'");
    expect(check.rows).toHaveLength(0);
  });

  it("does not restrict agency_admin/operations_manager", async () => {
    const res = await request(app)
      .post("/api/teams")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Admin Made Team", branch_id: branchBId });
    expect(res.status).toBe(201);
    await pool.query("DELETE FROM teams WHERE id = $1", [res.body.team.id]);
  });
});

describe("PATCH /teams/:id", () => {
  it("lets a branch_manager rename a team in their own branch", async () => {
    const res = await request(app)
      .patch(`/api/teams/${teamAId}`)
      .set("Authorization", `Bearer ${bmAToken}`)
      .send({ name: "Branch A Team Renamed" });
    expect(res.status).toBe(200);
    expect(res.body.team.name).toBe("Branch A Team Renamed");
  });

  it("403s a branch_manager renaming another branch's team", async () => {
    const res = await request(app)
      .patch(`/api/teams/${teamBId}`)
      .set("Authorization", `Bearer ${bmAToken}`)
      .send({ name: "Hijacked Team Name" });
    expect(res.status).toBe(403);
    const check = await pool.query("SELECT name FROM teams WHERE id = $1", [teamBId]);
    expect(check.rows[0].name).toBe("Branch B Team");
  });

  it("403s a branch_manager moving their own team into another branch", async () => {
    const res = await request(app)
      .patch(`/api/teams/${teamAId}`)
      .set("Authorization", `Bearer ${bmAToken}`)
      .send({ branch_id: branchBId });
    expect(res.status).toBe(403);
    const check = await pool.query("SELECT branch_id FROM teams WHERE id = $1", [teamAId]);
    expect(check.rows[0].branch_id).toBe(branchAId);
  });

  it("does not restrict agency_admin/operations_manager", async () => {
    const res = await request(app)
      .patch(`/api/teams/${teamBId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Branch B Team" }); // no-op rename, just proves no 403
    expect(res.status).toBe(200);
  });
});
