import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";

const router = Router();
router.use(authenticate, requirePermission("customers.view"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        company_id: z.string().uuid().optional(),
        product: z.string().optional(),
        bucket: z.string().optional(),
        q: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);

    const conditions: string[] = ["co.agency_id = $1"];
    const params: unknown[] = [req.user!.agency_id];

    if (q.company_id) {
      params.push(q.company_id);
      conditions.push(`c.company_id = $${params.length}`);
    }
    if (q.product) {
      params.push(q.product);
      conditions.push(`c.product = $${params.length}`);
    }
    if (q.bucket) {
      params.push(q.bucket);
      conditions.push(`c.bucket = $${params.length}`);
    }
    if (q.q) {
      params.push(`%${q.q}%`);
      const n = params.length;
      conditions.push(
        `(c.customer_name ILIKE $${n} OR c.loan_number ILIKE $${n} OR c.mobile_number ILIKE $${n})`,
      );
    }

    const where = conditions.join(" AND ");

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
         FROM customers c
         JOIN companies co ON co.id = c.company_id
        WHERE ${where}`,
      params,
    );

    const offset = (q.page - 1) * q.limit;
    params.push(q.limit, offset);

    const { rows } = await pool.query(
      `SELECT c.id, c.loan_number, c.customer_name, c.mobile_number,
              c.product, c.bucket, c.due_amount, c.emi,
              c.custom_fields, c.created_at,
              co.name AS company_name, co.id AS company_id
         FROM customers c
         JOIN companies co ON co.id = c.company_id
        WHERE ${where}
        ORDER BY c.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({
      customers: rows,
      total: countResult.rows[0].total,
      page: q.page,
      limit: q.limit,
    });
  }),
);

export default router;
