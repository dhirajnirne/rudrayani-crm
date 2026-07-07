import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";
import { capabilitiesOf } from "../types/user";
import { capabilitiesHavePermission } from "../services/permission-service";

const router = Router();
router.use(authenticate, requirePermission("calls.log"));

/**
 * PTP reminders due (build brief Section 6: PTP → Reminder). Agents see their
 * own promises; anyone with customers.allocate (TL and up) sees the whole
 * agency's so they can chase the team.
 */
router.get(
  "/due",
  asyncHandler(async (req, res) => {
    const q = z
      .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
      .parse(req.query);
    const dueBy = q.date ?? new Date().toISOString().slice(0, 10);

    const seesAll = await capabilitiesHavePermission(
      capabilitiesOf(req.user!),
      "customers.allocate",
    );

    const params: unknown[] = [req.user!.agency_id, dueBy];
    let agentFilter = "";
    if (!seesAll) {
      params.push(req.user!.id);
      agentFilter = `AND p.agent_id = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT p.id, p.amount, p.promised_date, p.mode, p.status, p.created_at,
              c.id AS customer_id, c.loan_number, c.customer_name, c.mobile_number,
              co.name AS company_name,
              u.full_name AS agent_name
         FROM ptps p
         JOIN customers c ON c.id = p.customer_id
         JOIN companies co ON co.id = c.company_id
         JOIN users u ON u.id = p.agent_id
        WHERE co.agency_id = $1
          AND p.status = 'pending'
          AND p.promised_date <= $2
          ${agentFilter}
        ORDER BY p.promised_date ASC, p.amount DESC`,
      params,
    );
    res.json({ ptps: rows, total: rows.length, due_by: dueBy });
  }),
);

export default router;
