import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/config/db";

// Integration tests: require the Postgres container to be running
// (docker compose up -d from the repo root).
describe("API basics", () => {
  const app = createApp();

  it("GET /api/health reports ok with db connected", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db_connected).toBe(true);
  });

  it("returns JSON 404 for unknown routes", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Not found");
  });
});

afterAll(async () => {
  await pool.end();
});
