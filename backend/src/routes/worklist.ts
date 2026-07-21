import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";
import { HttpError } from "../middleware/error-handler";

/**
 * The agent's worklist — "Today's Allocation" (build brief Section 8): every
 * active customer currently assigned to the logged-in user, with the last
 * disposition and any pending PTP so the agent knows where each case stands.
 */
const router = Router();
router.use(authenticate, requirePermission("calls.log"));

/**
 * Resolve the branch a branch_manager manages, for `scope=team`. Returns
 * null if the caller isn't a branch_manager or doesn't manage a branch --
 * callers must fall back to self-scope in that case, never to "everyone".
 */
async function resolveManagedBranchId(userId: string, designation: string): Promise<string | null> {
  if (designation !== "branch_manager") return null;
  const { rows } = await pool.query<{ id: string }>(
    "SELECT id FROM branches WHERE branch_manager_id = $1",
    [userId],
  );
  return rows[0]?.id ?? null;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const companyId = req.query.company_id as string | undefined;
    const customerBranch = req.query.customer_branch as string | undefined;
    const product = req.query.product as string | undefined;
    const bucket = req.query.bucket as string | undefined;
    const scope = req.query.scope as string | undefined;

    const params: unknown[] = [req.user!.id];
    let conditions: string;

    const managedBranchId = scope === "team" ? await resolveManagedBranchId(req.user!.id, req.user!.designation) : null;

    if (managedBranchId) {
      params.push(managedBranchId);
      conditions = `(
          EXISTS (SELECT 1 FROM users u WHERE u.id = c.assigned_agent_id
                    AND (u.branch_id = $2 OR u.team_id IN (SELECT id FROM teams WHERE branch_id = $2)))
          OR EXISTS (SELECT 1 FROM users u WHERE u.id = c.assigned_field_agent_id
                    AND (u.branch_id = $2 OR u.team_id IN (SELECT id FROM teams WHERE branch_id = $2)))
        ) AND c.status = 'active'`;
    } else {
      conditions = `(c.assigned_agent_id = $1 OR c.assigned_field_agent_id = $1) AND c.status = 'active'`;
    }

    if (q) {
      params.push(q);
      conditions += ` AND (c.customer_name ILIKE '%' || $${params.length} || '%' OR c.loan_number ILIKE '%' || $${params.length} || '%')`;
    }
    if (companyId) {
      params.push(companyId);
      conditions += ` AND c.company_id = $${params.length}`;
    }
    if (customerBranch) {
      params.push(customerBranch);
      const n = params.length;
      conditions += ` AND (c.branch_id::text = $${n} OR (c.branch_id IS NULL AND (c.custom_fields->>'branch' ILIKE '%' || $${n} || '%' OR c.custom_fields->>'Branch' ILIKE '%' || $${n} || '%')))`;
    }
    if (product) {
      params.push(product);
      conditions += ` AND c.product = $${params.length}`;
    }
    if (bucket) {
      params.push(bucket);
      conditions += ` AND c.bucket = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT c.id, c.loan_number, c.customer_name, c.mobile_number,
              c.product, c.bucket, c.due_amount, c.pos, c.emi, c.custom_fields,
              co.name AS company_name,
              COALESCE(b.name, NULLIF(TRIM(COALESCE(c.custom_fields->>'branch', c.custom_fields->>'Branch')), '')) AS branch_name,
              (c.assigned_agent_id = $1) AS is_primary_for_me,
              (c.assigned_field_agent_id = $1) AS is_field_agent_for_me,
              ag.full_name AS assigned_agent_name,
              fa.full_name AS assigned_field_agent_name,
              lc.remark AS last_remark,
              lc.created_at AS last_call_at,
              ld.result_code AS last_result_code,
              pp.amount AS ptp_amount,
              pp.promised_date AS ptp_date,
              bm.normalized_pending
         FROM customers c
         JOIN companies co ON co.id = c.company_id
         LEFT JOIN branches b ON b.id = c.branch_id
         LEFT JOIN users ag ON ag.id = c.assigned_agent_id
         LEFT JOIN users fa ON fa.id = c.assigned_field_agent_id
         LEFT JOIN LATERAL (
              SELECT cl.remark, cl.created_at, cl.disposition_code_id
                FROM call_logs cl
               WHERE cl.customer_id = c.id
               ORDER BY cl.created_at DESC LIMIT 1
         ) lc ON true
         LEFT JOIN disposition_codes ld ON ld.id = lc.disposition_code_id
         LEFT JOIN LATERAL (
              SELECT p.amount, p.promised_date
                FROM ptps p
               WHERE p.customer_id = c.id AND p.status = 'pending'
               ORDER BY p.promised_date ASC LIMIT 1
         ) pp ON true
         LEFT JOIN LATERAL (
              SELECT EXISTS(
                SELECT 1 FROM bucket_movements m
                 WHERE m.customer_id = c.id AND m.trigger = 'payment'
                   AND m.month = date_trunc('month', now())
              ) AS normalized_pending
         ) bm ON true
        WHERE ${conditions}
        ORDER BY pp.promised_date ASC NULLS LAST, c.due_amount DESC NULLS LAST`,
      params,
    );
    res.json({ customers: rows, total: rows.length });
  }),
);

/**
 * Single customer, same shape as the list above — backs the mobile app's
 * customer-detail and its child screens (call log / payment / PTPs / field
 * visit), which resolve the customer by id on each screen load instead of
 * carrying the object across navigation (go_router's `extra` doesn't survive
 * an app restart or a cold deep link). 404 rather than 403 if the customer
 * isn't assigned to the caller, so the scope check doesn't leak whether an
 * out-of-scope loan number exists.
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);

    const { rows } = await pool.query(
      `SELECT c.id, c.loan_number, c.customer_name, c.mobile_number,
              c.product, c.bucket, c.due_amount, c.pos, c.emi, c.custom_fields,
              co.name AS company_name,
              COALESCE(b.name, NULLIF(TRIM(COALESCE(c.custom_fields->>'branch', c.custom_fields->>'Branch')), '')) AS branch_name,
              (c.assigned_agent_id = $1) AS is_primary_for_me,
              (c.assigned_field_agent_id = $1) AS is_field_agent_for_me,
              lc.remark AS last_remark,
              lc.created_at AS last_call_at,
              ld.result_code AS last_result_code,
              pp.amount AS ptp_amount,
              pp.promised_date AS ptp_date,
              bm.normalized_pending
         FROM customers c
         JOIN companies co ON co.id = c.company_id
         LEFT JOIN branches b ON b.id = c.branch_id
         LEFT JOIN LATERAL (
              SELECT cl.remark, cl.created_at, cl.disposition_code_id
                FROM call_logs cl
               WHERE cl.customer_id = c.id
               ORDER BY cl.created_at DESC LIMIT 1
         ) lc ON true
         LEFT JOIN disposition_codes ld ON ld.id = lc.disposition_code_id
         LEFT JOIN LATERAL (
              SELECT p.amount, p.promised_date
                FROM ptps p
               WHERE p.customer_id = c.id AND p.status = 'pending'
               ORDER BY p.promised_date ASC LIMIT 1
         ) pp ON true
         LEFT JOIN LATERAL (
              SELECT EXISTS(
                SELECT 1 FROM bucket_movements m
                 WHERE m.customer_id = c.id AND m.trigger = 'payment'
                   AND m.month = date_trunc('month', now())
              ) AS normalized_pending
         ) bm ON true
        WHERE c.id = $2
          AND (c.assigned_agent_id = $1 OR c.assigned_field_agent_id = $1)
          AND c.status = 'active'`,
      [req.user!.id, id],
    );
    const customer = rows[0];
    if (!customer) throw new HttpError(404, "Customer not found");
    res.json({ customer });
  }),
);

export default router;
