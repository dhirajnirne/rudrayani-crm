import { Router } from "express";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";

/**
 * The agent's worklist — "Today's Allocation" (build brief Section 8): every
 * active customer currently assigned to the logged-in user, with the last
 * disposition and any pending PTP so the agent knows where each case stands.
 */
const router = Router();
router.use(authenticate, requirePermission("calls.log"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT c.id, c.loan_number, c.customer_name, c.mobile_number,
              c.product, c.bucket, c.due_amount, c.emi, c.custom_fields,
              co.name AS company_name,
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
        WHERE (c.assigned_agent_id = $1 OR c.assigned_field_agent_id = $1) AND c.status = 'active'
        ORDER BY pp.promised_date ASC NULLS LAST, c.due_amount DESC NULLS LAST`,
      [req.user!.id],
    );
    res.json({ customers: rows, total: rows.length });
  }),
);

export default router;
