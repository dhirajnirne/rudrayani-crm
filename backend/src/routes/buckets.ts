import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";
import { HttpError } from "../middleware/error-handler";

/**
 * Buckets master admin (Phase 5). Rows come from imports (auto-registered),
 * never created here — the admin only orders them (delinquency progression)
 * and flags category (npa → Recovery metric) and the "current" bucket
 * (→ Normalization metric). Deleting is not offered: snapshots reference
 * labels historically.
 */
const router = Router();
router.use(authenticate);

async function assertCompanyInAgency(companyId: string, agencyId: string): Promise<void> {
  const { rows } = await pool.query("SELECT 1 FROM companies WHERE id = $1 AND agency_id = $2", [
    companyId,
    agencyId,
  ]);
  if (rows.length === 0) throw new HttpError(404, "Company not found in this agency");
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const companyId = req.query.company_id ? z.string().uuid().parse(req.query.company_id) : undefined;
    if (companyId) {
      await assertCompanyInAgency(companyId, req.user!.agency_id);
      const { rows } = await pool.query(
        `SELECT id, label, sort_order, category, is_current, canonical_bucket
           FROM buckets WHERE company_id = $1
          ORDER BY sort_order, label`,
        [companyId],
      );
      res.json({ buckets: rows });
      return;
    }
    // No company selected -- agency-wide distinct bucket labels (e.g. for a
    // worklist filter spanning multiple companies), one row per label.
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (b.label) b.id, b.label, b.sort_order, b.category, b.is_current, b.canonical_bucket
         FROM buckets b
         JOIN companies co ON co.id = b.company_id
        WHERE co.agency_id = $1
        ORDER BY b.label, b.sort_order`,
      [req.user!.agency_id],
    );
    res.json({ buckets: rows });
  }),
);

const reorderSchema = z.object({
  company_id: z.string().uuid(),
  ordered_ids: z.array(z.string().uuid()).min(1),
});

/** Full reorder: the client sends every bucket id in its new order. */
router.put(
  "/reorder",
  requirePermission("companies.manage"),
  asyncHandler(async (req, res) => {
    const body = reorderSchema.parse(req.body);
    await assertCompanyInAgency(body.company_id, req.user!.agency_id);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT id FROM buckets WHERE company_id = $1 FOR UPDATE",
        [body.company_id],
      );
      const existing = new Set(rows.map((r) => r.id as string));
      if (
        existing.size !== body.ordered_ids.length ||
        body.ordered_ids.some((id) => !existing.has(id))
      ) {
        throw new HttpError(400, "ordered_ids must contain every bucket of the company exactly once");
      }
      for (let i = 0; i < body.ordered_ids.length; i++) {
        await client.query("UPDATE buckets SET sort_order = $1 WHERE id = $2", [
          i,
          body.ordered_ids[i],
        ]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    res.json({ ok: true });
  }),
);

const patchSchema = z
  .object({
    category: z.enum(["normal", "npa"]).optional(),
    is_current: z.boolean().optional(),
    // 0 = X/current month EMI, 1 = 30 DPD, 2 = 60 DPD, ... null clears the mapping
    // (movement detection then skips this bucket rather than guessing).
    canonical_bucket: z.number().int().min(0).nullable().optional(),
  })
  .refine(
    (b) => b.category !== undefined || b.is_current !== undefined || b.canonical_bucket !== undefined,
    { message: "Nothing to update" },
  );

router.patch(
  "/:id",
  requirePermission("companies.manage"),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = patchSchema.parse(req.body);

    const { rows } = await pool.query(
      `SELECT b.id, b.company_id FROM buckets b
         JOIN companies co ON co.id = b.company_id
        WHERE b.id = $1 AND co.agency_id = $2`,
      [id, req.user!.agency_id],
    );
    if (rows.length === 0) throw new HttpError(404, "Bucket not found");
    const companyId = rows[0].company_id as string;

    // canonical_bucket=0 means "this IS the current/no-arrears bucket" --
    // that's the same fact is_current encodes, so setting one implies the other.
    const willBeCurrent = body.is_current === true || body.canonical_bucket === 0;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (willBeCurrent) {
        // Only one bucket per company can mean "account is current".
        await client.query(
          "UPDATE buckets SET is_current = false WHERE company_id = $1 AND id <> $2",
          [companyId, id],
        );
      }
      const { rows: updated } = await client.query(
        `UPDATE buckets
            SET category = COALESCE($2, category),
                is_current = CASE WHEN $3 THEN true ELSE COALESCE($4, is_current) END,
                canonical_bucket = CASE WHEN $5 THEN canonical_bucket ELSE $6 END
          WHERE id = $1
        RETURNING id, label, sort_order, category, is_current, canonical_bucket`,
        [
          id,
          body.category ?? null,
          willBeCurrent,
          body.is_current ?? null,
          body.canonical_bucket === undefined,
          body.canonical_bucket ?? null,
        ],
      );
      await client.query("COMMIT");
      res.json({ bucket: updated[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }),
);

export default router;
