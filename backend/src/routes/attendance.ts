import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { HttpError } from "../middleware/error-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";

const router = Router();
router.use(authenticate, requirePermission("attendance.punch"));

const gpsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * Punch in — opens the shift and starts the tracking session (brief Section 10:
 * "punch-in starts the location-tracking session ... explicit in the UI").
 * The partial unique index uq_attendance_open_shift backstops the 409.
 */
router.post(
  "/punch-in",
  asyncHandler(async (req, res) => {
    const { lat, lng } = gpsSchema.parse(req.body);

    const open = await pool.query(
      "SELECT id FROM attendance WHERE user_id = $1 AND punch_out_at IS NULL",
      [req.user!.id],
    );
    if (open.rows.length > 0) throw new HttpError(409, "Already punched in");

    const { rows } = await pool.query(
      `INSERT INTO attendance (user_id, punch_in_at, punch_in_location)
       VALUES ($1, now(), ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography)
       RETURNING id, punch_in_at`,
      [req.user!.id, lng, lat],
    );
    res.status(201).json({ attendance: rows[0] });
  }),
);

/** Punch out — closes the open shift and ends the tracking session. */
router.post(
  "/punch-out",
  asyncHandler(async (req, res) => {
    const { lat, lng } = gpsSchema.parse(req.body);

    const { rows } = await pool.query(
      `UPDATE attendance
          SET punch_out_at = now(),
              punch_out_location = ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
        WHERE user_id = $1 AND punch_out_at IS NULL
        RETURNING id, punch_in_at, punch_out_at`,
      [req.user!.id, lng, lat],
    );
    if (rows.length === 0) throw new HttpError(409, "Not punched in");
    res.json({ attendance: rows[0] });
  }),
);

/**
 * Current shift state — the app calls this on startup so a restarted phone
 * resumes (or stops) tracking to match the server's view of the shift.
 */
router.get(
  "/status",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id, punch_in_at FROM attendance WHERE user_id = $1 AND punch_out_at IS NULL",
      [req.user!.id],
    );
    res.json({ punched_in: rows.length > 0, attendance: rows[0] ?? null });
  }),
);

export default router;
