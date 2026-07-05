import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";
import { HttpError } from "../middleware/error-handler";

const router = Router();
router.use(authenticate);

const bodySchema = z.object({ name: z.string().trim().min(1).max(200) });

// Companies are data sources (Hero, Bajaj, ...), not org structure — brief Section 2.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id, name, created_at FROM companies WHERE agency_id = $1 ORDER BY name",
      [req.user!.agency_id],
    );
    res.json({ companies: rows });
  }),
);

router.post(
  "/",
  requirePermission("companies.manage"),
  asyncHandler(async (req, res) => {
    const body = bodySchema.parse(req.body);
    const { rows } = await pool.query(
      "INSERT INTO companies (agency_id, name) VALUES ($1, $2) RETURNING id, name, created_at",
      [req.user!.agency_id, body.name],
    );
    res.status(201).json({ company: rows[0] });
  }),
);

router.patch(
  "/:id",
  requirePermission("companies.manage"),
  asyncHandler(async (req, res) => {
    const body = bodySchema.parse(req.body);
    const { rows } = await pool.query(
      `UPDATE companies SET name = $3 WHERE id = $1 AND agency_id = $2
       RETURNING id, name, created_at`,
      [req.params.id, req.user!.agency_id, body.name],
    );
    if (!rows[0]) throw new HttpError(404, "Company not found");
    res.json({ company: rows[0] });
  }),
);

export default router;
