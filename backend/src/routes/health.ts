import { Router } from "express";
import { pool } from "../config/db";
import { logger } from "../config/logger";

const router = Router();

// GET /api/health -> confirms the API is up and can reach Postgres
router.get("/health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW() as server_time");
    res.json({
      status: "ok",
      db_connected: true,
      server_time: result.rows[0].server_time,
    });
  } catch (err) {
    logger.error({ err }, "Health check DB error");
    res.status(500).json({ status: "error", db_connected: false });
  }
});

export default router;
