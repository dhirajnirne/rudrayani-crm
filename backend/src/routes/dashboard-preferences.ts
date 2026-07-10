import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate } from "../middleware/authenticate";

/**
 * Per-user dashboard customization (show/hide + reorder metric widgets).
 * Every authenticated user manages only their own row — no extra
 * permission gate beyond being logged in. `layout` is null until the user
 * saves one; the client falls back to a role-based default order/visibility
 * from its own widget registry rather than this being backend-seeded.
 */
const router = Router();
router.use(authenticate);

const layoutSchema = z.object({
  widgets: z.array(
    z.object({
      id: z.string(),
      visible: z.boolean(),
      order: z.number().int(),
    }),
  ),
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT layout FROM dashboard_preferences WHERE user_id = $1 AND is_default = true`,
      [req.user!.id],
    );
    res.json({ layout: rows[0]?.layout ?? null });
  }),
);

router.put(
  "/",
  asyncHandler(async (req, res) => {
    const body = z.object({ layout: layoutSchema }).parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO dashboard_preferences (user_id, layout, is_default)
       VALUES ($1, $2, true)
       ON CONFLICT (user_id) WHERE is_default
       DO UPDATE SET layout = EXCLUDED.layout, updated_at = now()
       RETURNING layout`,
      [req.user!.id, JSON.stringify(body.layout)],
    );
    res.json({ layout: rows[0].layout });
  }),
);

router.delete(
  "/",
  asyncHandler(async (req, res) => {
    await pool.query(
      `DELETE FROM dashboard_preferences WHERE user_id = $1 AND is_default = true`,
      [req.user!.id],
    );
    res.json({ layout: null });
  }),
);

export default router;
