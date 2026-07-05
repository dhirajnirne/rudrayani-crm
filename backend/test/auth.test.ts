import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/config/db";
import { hashPassword } from "../src/services/auth-service";

// Integration tests: require the Postgres container running with migrations applied.
const app = createApp();

const PASSWORD = "Secret@123";
const ADMIN_PHONE = "7000000001";
const AGENT_PHONE = "7000000002";
const LOCKOUT_PHONE = "7000000003";

let agencyId: string;

beforeAll(async () => {
  const agency = await pool.query(
    "INSERT INTO agencies (name) VALUES ('Test Agency (auth.test)') RETURNING id",
  );
  agencyId = agency.rows[0].id;
  const hash = await hashPassword(PASSWORD);
  await pool.query(
    `INSERT INTO users (agency_id, full_name, phone, password_hash, is_agency_admin)
     VALUES ($1, 'Test Admin', $2, $3, true)`,
    [agencyId, ADMIN_PHONE, hash],
  );
  await pool.query(
    `INSERT INTO users (agency_id, full_name, phone, password_hash, is_field_agent)
     VALUES ($1, 'Test Agent', $2, $3, true)`,
    [agencyId, AGENT_PHONE, hash],
  );
  await pool.query(
    `INSERT INTO users (agency_id, full_name, phone, password_hash, is_telecaller)
     VALUES ($1, 'Lockout Target', $2, $3, true)`,
    [agencyId, LOCKOUT_PHONE, hash],
  );
});

afterAll(async () => {
  await pool.query(
    "DELETE FROM users WHERE phone IN ($1, $2, $3)",
    [ADMIN_PHONE, AGENT_PHONE, LOCKOUT_PHONE],
  );
  await pool.query("DELETE FROM agencies WHERE id = $1", [agencyId]);
  await pool.end();
});

describe("POST /api/auth/login", () => {
  it("returns tokens and the public user shape on success", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ phone: ADMIN_PHONE, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.refresh_token).toBeTruthy();
    expect(res.body.user.capabilities).toEqual(["agency_admin"]);
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it("rejects a wrong password with a generic 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ phone: ADMIN_PHONE, password: "WrongPass1" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid phone or password");
  });

  it("rejects an unknown phone with the same generic 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ phone: "7999999999", password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid phone or password");
  });

  it("locks the account after repeated failures, then rejects even correct logins", async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/auth/login")
        .send({ phone: LOCKOUT_PHONE, password: "WrongPass1" });
    }
    const locked = await request(app)
      .post("/api/auth/login")
      .send({ phone: LOCKOUT_PHONE, password: PASSWORD });
    expect(locked.status).toBe(423);
  });

  it("device binding: a login on a new device supersedes older device sessions", async () => {
    const first = await request(app)
      .post("/api/auth/login")
      .send({ phone: AGENT_PHONE, password: PASSWORD, device_id: "device-A" });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/auth/login")
      .send({ phone: AGENT_PHONE, password: PASSWORD, device_id: "device-B" });
    expect(second.status).toBe(200);

    // device-A's refresh token no longer works.
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refresh_token: first.body.refresh_token });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/refresh", () => {
  it("rotates the refresh token (old one becomes single-use)", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ phone: ADMIN_PHONE, password: PASSWORD });

    const refreshed = await request(app)
      .post("/api/auth/refresh")
      .send({ refresh_token: login.body.refresh_token });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.access_token).toBeTruthy();

    const reused = await request(app)
      .post("/api/auth/refresh")
      .send({ refresh_token: login.body.refresh_token });
    expect(reused.status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the profile with a valid token and 401 without one", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ phone: ADMIN_PHONE, password: PASSWORD });

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${login.body.access_token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.phone).toBe(ADMIN_PHONE);

    const anon = await request(app).get("/api/auth/me");
    expect(anon.status).toBe(401);
  });
});

describe("OTP password reset", () => {
  it("full flow: request OTP (dev returns it), reset password, old sessions revoked", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ phone: ADMIN_PHONE, password: PASSWORD });

    const otpRes = await request(app)
      .post("/api/auth/otp/request")
      .send({ phone: ADMIN_PHONE });
    expect(otpRes.status).toBe(200);
    expect(otpRes.body.devOtp).toMatch(/^\d{6}$/);

    const newPassword = "NewSecret@456";
    const verify = await request(app)
      .post("/api/auth/otp/verify")
      .send({ phone: ADMIN_PHONE, otp: otpRes.body.devOtp, new_password: newPassword });
    expect(verify.status).toBe(200);

    // Old password no longer works; new one does.
    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ phone: ADMIN_PHONE, password: PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ phone: ADMIN_PHONE, password: newPassword });
    expect(newLogin.status).toBe(200);

    // Pre-reset refresh token was revoked.
    const staleRefresh = await request(app)
      .post("/api/auth/refresh")
      .send({ refresh_token: login.body.refresh_token });
    expect(staleRefresh.status).toBe(401);

    // Reset back so other tests / reruns are unaffected.
    const backOtp = await request(app)
      .post("/api/auth/otp/request")
      .send({ phone: ADMIN_PHONE });
    await request(app)
      .post("/api/auth/otp/verify")
      .send({ phone: ADMIN_PHONE, otp: backOtp.body.devOtp, new_password: PASSWORD });
  });

  it("rejects a wrong OTP and does not leak whether a phone exists on request", async () => {
    const unknown = await request(app)
      .post("/api/auth/otp/request")
      .send({ phone: "7999999998" });
    expect(unknown.status).toBe(200); // same as for a real phone

    await request(app).post("/api/auth/otp/request").send({ phone: AGENT_PHONE });
    const bad = await request(app)
      .post("/api/auth/otp/verify")
      .send({ phone: AGENT_PHONE, otp: "000000", new_password: "Whatever@123" });
    // 400 either way (incorrect OTP), never a success with a guessed code
    expect(bad.status).toBe(400);
  });
});
