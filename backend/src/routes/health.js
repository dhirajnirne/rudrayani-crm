const express = require("express");
const { pool } = require("../config/db");

const router = express.Router();

// GET /api/health -> confirms the API is up and can reach Postgres
router.get("/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() as server_time");
    res.json({
      status: "ok",
      db_connected: true,
      server_time: result.rows[0].server_time,
    });
  } catch (err) {
    console.error("Health check DB error:", err.message);
    res.status(500).json({ status: "error", db_connected: false, error: err.message });
  }
});

module.exports = router;
