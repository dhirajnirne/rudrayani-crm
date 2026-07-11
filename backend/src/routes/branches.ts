import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";
import { HttpError } from "../middleware/error-handler";
import { depositTotals, listDeposits } from "../services/report-service";

const router = Router();
router.use(authenticate);

const bodySchema = z.object({ name: z.string().trim().min(1).max(200) });
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

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

/**
 * Branch drill-down (Phase 9): one aggregating fetch behind the BranchesPage
 * drawer -- team details, targets, and deposits for this branch. Agent-wise
 * breakdown is deliberately NOT duplicated here: the frontend embeds the
 * existing BreakdownTable widget (dimension=agent, branch_id=this branch),
 * which already hits GET /reports/breakdown on its own.
 * Gated the same as the Branches nav item itself (branches.manage), so every
 * caller who reaches this is agency-wide (agency_admin/operations_manager) --
 * no report-scope clamping needed for the deposit/target reuse below.
 */
router.get(
  "/:id",
  requirePermission("branches.manage"),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const query = z
      .object({ month: z.string().regex(MONTH_RE, "month must be YYYY-MM").optional() })
      .parse(req.query);
    const agencyId = req.user!.agency_id;
    const month = query.month ?? new Date().toISOString().slice(0, 7);
    const monthStart = `${month}-01`;

    const { rows: branchRows } = await pool.query(
      "SELECT id, name, created_at FROM branches WHERE id = $1 AND agency_id = $2",
      [id, agencyId],
    );
    const branch = branchRows[0];
    if (!branch) throw new HttpError(404, "Branch not found");

    const [teamsRes, agentCountRes, targetsRes, deposits, depositPayments] = await Promise.all([
      pool.query(
        `SELECT t.id, t.name, t.created_at,
                COUNT(DISTINCT u.id) FILTER (WHERE u.is_active)::int AS member_count,
                (SELECT tl.full_name FROM users tl
                  WHERE tl.team_id = t.id AND tl.is_team_leader AND tl.is_active
                  ORDER BY tl.full_name LIMIT 1) AS team_leader_name
           FROM teams t
           LEFT JOIN users u ON u.team_id = t.id
          WHERE t.branch_id = $1
          GROUP BY t.id
          ORDER BY t.name`,
        [id],
      ),
      pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE branch_id = $1 AND is_active`, [id]),
      pool.query(
        `SELECT t.id, t.metric, t.target_amount, t.target_count, t.product, t.bucket,
                co.name AS company_name
           FROM targets t
           LEFT JOIN companies co ON co.id = t.company_id
          WHERE t.agency_id = $1 AND t.scope_type = 'branch' AND t.scope_id = $2
            AND t.month = $3::date
          ORDER BY t.metric`,
        [agencyId, id, monthStart],
      ),
      depositTotals(agencyId, { month: monthStart, branch_id: id }),
      listDeposits(agencyId, { month: monthStart, branch_id: id, limit: 200 }),
    ]);

    res.json({
      branch,
      month,
      teams: teamsRes.rows,
      team_count: teamsRes.rows.length,
      agent_count: agentCountRes.rows[0].n,
      targets: targetsRes.rows,
      deposits: { ...deposits, payments: depositPayments },
    });
  }),
);

export default router;
