import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";
import { HttpError } from "../middleware/error-handler";
import { capabilitiesHavePermission } from "../services/permission-service";
import { agentBranchClamp, customerBranchClamp, resolveBranchClamp } from "../services/scope";
import { capabilitiesOf } from "../types/user";

/**
 * Agent-initiated reallocation requests (brief §8, TL view: "Reallocation
 * approvals"). An agent flags a customer they can't work (wrong area,
 * language, dispute); anyone with customers.allocate approves — reassigning
 * or returning the customer to the unallocated pool — or rejects.
 */
const router = Router();
router.use(authenticate);

/** Agent raises a request for a customer assigned to them. */
router.post(
  "/",
  requirePermission("calls.log"),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        customer_id: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(req.body);

    const cust = await pool.query(
      `SELECT c.id, c.assigned_agent_id FROM customers c
         JOIN companies co ON co.id = c.company_id
        WHERE c.id = $1 AND co.agency_id = $2 AND c.status = 'active'`,
      [body.customer_id, req.user!.agency_id],
    );
    if (!cust.rows[0]) throw new HttpError(404, "Customer not found or already closed");
    if (cust.rows[0].assigned_agent_id !== req.user!.id) {
      throw new HttpError(403, "You can only request reallocation of your own customers");
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO reallocation_requests (customer_id, requested_by, reason)
         VALUES ($1, $2, $3) RETURNING *`,
        [body.customer_id, req.user!.id, body.reason],
      );
      res.status(201).json({ request: rows[0] });
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
        throw new HttpError(409, "A reallocation request is already pending for this customer");
      }
      throw err;
    }
  }),
);

/**
 * Pending (or historical) requests. TL/ops (customers.allocate) see the
 * whole agency's approval queue; a plain agent sees only requests they
 * submitted themselves -- same self-clamp convention already used in
 * reminders.ts/ptps.ts, so an agent can check the status of their own
 * requests without needing approval power.
 */
router.get(
  "/",
  requirePermission("calls.log"),
  asyncHandler(async (req, res) => {
    const status = z
      .enum(["pending", "approved", "rejected", "all"])
      .default("pending")
      .parse(req.query.status ?? "pending");
    const seesAll = await capabilitiesHavePermission(capabilitiesOf(req.user!), "customers.allocate");

    const params: unknown[] = [req.user!.agency_id];
    const filters: string[] = [];
    if (status !== "all") {
      params.push(status);
      filters.push(`r.status = $${params.length}`);
    }
    if (!seesAll) {
      params.push(req.user!.id);
      filters.push(`r.requested_by = $${params.length}`);
    } else {
      // Between "own requests only" and "whole agency" -- a branch_manager
      // only ever sees their own branch's approval queue.
      const clamp = await resolveBranchClamp(req.user!);
      const clampSql = customerBranchClamp(clamp, params, "c");
      if (clampSql) filters.push(clampSql.replace(/^ AND /, ""));
    }

    const { rows } = await pool.query(
      `SELECT r.id, r.reason, r.status, r.created_at, r.decided_at, r.decision_note,
              c.id AS customer_id, c.loan_number, c.customer_name, c.due_amount, c.pos,
              co.name AS company_name,
              u.id AS requested_by_id, u.full_name AS requested_by_name,
              d.full_name AS decided_by_name
         FROM reallocation_requests r
         JOIN customers c ON c.id = r.customer_id
         JOIN companies co ON co.id = c.company_id
         JOIN users u ON u.id = r.requested_by
         LEFT JOIN users d ON d.id = r.decided_by
        WHERE co.agency_id = $1
          ${filters.map((f) => `AND ${f}`).join(" ")}
        ORDER BY r.created_at DESC`,
      params,
    );
    res.json({ requests: rows, total: rows.length });
  }),
);

/**
 * Approve (reassign to new_agent_id, or return to the unallocated pool when
 * omitted) or reject. Approvals with a new agent land in allocation_logs
 * like any other reallocation.
 */
router.post(
  "/:id/decide",
  requirePermission("customers.allocate"),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        approve: z.boolean(),
        new_agent_id: z.string().uuid().optional(),
        note: z.string().trim().max(500).optional(),
      })
      .parse(req.body);

    // A branch_manager can only decide requests for their own branch's
    // customers, and can only reassign to an agent in their own branch.
    const clamp = await resolveBranchClamp(req.user!);
    const reqParams: unknown[] = [id, req.user!.agency_id];
    const reqClampSql = customerBranchClamp(clamp, reqParams, "c");
    const reqRes = await pool.query(
      `SELECT r.*, c.assigned_agent_id FROM reallocation_requests r
         JOIN customers c ON c.id = r.customer_id
         JOIN companies co ON co.id = c.company_id
        WHERE r.id = $1 AND co.agency_id = $2${reqClampSql}`,
      reqParams,
    );
    const request = reqRes.rows[0];
    if (!request) throw new HttpError(404, "Request not found");
    if (request.status !== "pending") throw new HttpError(409, "Request already decided");

    if (body.approve && body.new_agent_id) {
      const agentParams: unknown[] = [body.new_agent_id, req.user!.agency_id];
      const agentClampSql = agentBranchClamp(clamp, agentParams, "users");
      const agent = await pool.query(
        `SELECT id FROM users WHERE id = $1 AND agency_id = $2 AND is_active = true${agentClampSql}`,
        agentParams,
      );
      if (!agent.rows[0]) throw new HttpError(404, "New agent not found in this agency");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE reallocation_requests
            SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4
          WHERE id = $1 RETURNING *`,
        [id, body.approve ? "approved" : "rejected", req.user!.id, body.note ?? null],
      );

      if (body.approve) {
        await client.query("UPDATE customers SET assigned_agent_id = $2 WHERE id = $1", [
          request.customer_id,
          body.new_agent_id ?? null,
        ]);
        if (body.new_agent_id) {
          await client.query(
            `INSERT INTO allocation_logs (customer_id, from_agent_id, to_agent_id, allocated_by, reason)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              request.customer_id,
              request.assigned_agent_id,
              body.new_agent_id,
              req.user!.id,
              `Reallocation request approved: ${request.reason}`,
            ],
          );
        }
      }

      await client.query("COMMIT");
      res.json({ request: updated.rows[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }),
);

export default router;
