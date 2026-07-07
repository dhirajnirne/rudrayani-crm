import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";
import { PING_RETENTION_DAYS } from "../jobs/purge-pings";

const router = Router();
router.use(authenticate, requirePermission("attendance.punch"));

const DEFAULT_PING_INTERVAL_SECONDS = 120; // brief Section 9: every 2 minutes

const pingSchema = z.object({
  recorded_at: z.string().datetime({ offset: true }),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy_meters: z.number().nonnegative().optional(),
});

const batchSchema = z.object({
  pings: z.array(pingSchema).min(1).max(500),
});

/**
 * Batch ping ingestion (brief Section 9). Batch-friendly so the app can flush
 * an offline queue in one request; (user_id, recorded_at) is unique, so a
 * batch that was already half-committed can be re-sent safely.
 */
router.post(
  "/pings",
  asyncHandler(async (req, res) => {
    const { pings } = batchSchema.parse(req.body);

    const values: string[] = [];
    const params: unknown[] = [req.user!.id];
    for (const p of pings) {
      params.push(p.recorded_at, p.lng, p.lat, p.accuracy_meters ?? null);
      const i = params.length;
      values.push(
        `($1, $${i - 3}, ST_SetSRID(ST_MakePoint($${i - 2}, $${i - 1}), 4326)::geography, $${i})`,
      );
    }

    const result = await pool.query(
      `INSERT INTO location_pings (user_id, recorded_at, location, accuracy_meters)
       VALUES ${values.join(", ")}
       ON CONFLICT (user_id, recorded_at) DO NOTHING`,
      params,
    );
    res.status(201).json({ received: pings.length, inserted: result.rowCount });
  }),
);

/**
 * Tracking config for the app. The interval is tunable per agency via
 * agencies.settings (Phase 6 adds the admin screen); default 2 minutes.
 */
router.get(
  "/config",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT settings->>'ping_interval_seconds' AS interval FROM agencies WHERE id = $1",
      [req.user!.agency_id],
    );
    const configured = Number(rows[0]?.interval);
    res.json({
      ping_interval_seconds:
        Number.isFinite(configured) && configured > 0
          ? configured
          : DEFAULT_PING_INTERVAL_SECONDS,
      retention_days: PING_RETENTION_DAYS,
    });
  }),
);

export default router;
