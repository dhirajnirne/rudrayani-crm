import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";
import { HttpError } from "../middleware/error-handler";

const router = Router();
router.use(authenticate);

const bodySchema = z.object({ name: z.string().trim().min(1).max(200) });

// Any authenticated user in the agency can list branches (needed for pickers).
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id, name, created_at FROM branches WHERE agency_id = $1 ORDER BY name",
      [req.user!.agency_id],
    );
    res.json({ branches: rows });
  }),
);

router.post(
  "/",
  requirePermission("branches.manage"),
  asyncHandler(async (req, res) => {
    const body = bodySchema.parse(req.body);
    const { rows } = await pool.query(
      "INSERT INTO branches (agency_id, name) VALUES ($1, $2) RETURNING id, name, created_at",
      [req.user!.agency_id, body.name],
    );
    res.status(201).json({ branch: rows[0] });
  }),
);

router.patch(
  "/:id",
  requirePermission("branches.manage"),
  asyncHandler(async (req, res) => {
    const body = bodySchema.parse(req.body);
    const { rows } = await pool.query(
      `UPDATE branches SET name = $3 WHERE id = $1 AND agency_id = $2
       RETURNING id, name, created_at`,
      [req.params.id, req.user!.agency_id, body.name],
    );
    if (!rows[0]) throw new HttpError(404, "Branch not found");
    res.json({ branch: rows[0] });
  }),
);

export default router;
