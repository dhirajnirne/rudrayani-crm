import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";
import { HttpError } from "../middleware/error-handler";

/**
 * Products & buckets — both DERIVED from imported data per company (brief §4):
 * products get an admin normalization layer; buckets are used verbatim.
 */
// NOTE: this router is mounted at the bare /api prefix, so middleware is applied
// per-route — a router-wide `use(authenticate)` would swallow unknown /api/*
// paths and break the JSON 404 handler.
const router = Router();

async function assertCompanyInAgency(companyId: string, agencyId: string): Promise<void> {
  const { rows } = await pool.query("SELECT 1 FROM companies WHERE id = $1 AND agency_id = $2", [
    companyId,
    agencyId,
  ]);
  if (rows.length === 0) throw new HttpError(404, "Company not found in this agency");
}

router.get(
  "/products",
  authenticate,
  asyncHandler(async (req, res) => {
    const companyId = z.string().uuid().parse(req.query.company_id);
    await assertCompanyInAgency(companyId, req.user!.agency_id);
    const { rows } = await pool.query(
      `SELECT p.id, p.raw_label, p.canonical_label,
              (SELECT COUNT(*)::int FROM customers c
                WHERE c.company_id = p.company_id AND c.product = p.raw_label) AS customer_count
         FROM products p
        WHERE p.company_id = $1
        ORDER BY p.canonical_label, p.raw_label`,
      [companyId],
    );
    res.json({ products: rows });
  }),
);

const normalizeSchema = z.object({
  company_id: z.string().uuid(),
  raw_labels: z.array(z.string().min(1)).min(1),
  canonical_label: z.string().trim().min(1).max(200),
});

/** "HL" + "Home Loan" -> canonical "Home Loan", no re-import (brief §4). */
router.post(
  "/products/normalize",
  authenticate,
  requirePermission("imports.manage"),
  asyncHandler(async (req, res) => {
    const body = normalizeSchema.parse(req.body);
    await assertCompanyInAgency(body.company_id, req.user!.agency_id);
    const { rowCount } = await pool.query(
      `UPDATE products SET canonical_label = $3
        WHERE company_id = $1 AND raw_label = ANY($2)`,
      [body.company_id, body.raw_labels, body.canonical_label],
    );
    if (rowCount === 0) throw new HttpError(404, "No matching product labels found");
    res.json({ ok: true, updated: rowCount });
  }),
);

/** Buckets come straight from the imported data — distinct values, no master. */
router.get(
  "/buckets",
  authenticate,
  asyncHandler(async (req, res) => {
    const companyId = z.string().uuid().parse(req.query.company_id);
    await assertCompanyInAgency(companyId, req.user!.agency_id);
    const { rows } = await pool.query(
      `SELECT DISTINCT bucket FROM customers
        WHERE company_id = $1 AND bucket IS NOT NULL
        ORDER BY bucket`,
      [companyId],
    );
    res.json({ buckets: rows.map((r) => r.bucket as string) });
  }),
);

export default router;
