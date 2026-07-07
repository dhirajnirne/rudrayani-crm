import { Router } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";
import { HttpError } from "../middleware/error-handler";

/**
 * Discrepancy review queue (Phase 7): additions, removals, and reactivations
 * detected by the allocation import diff (see import-service.ts) wait here
 * for an agency_admin/operations_manager decision instead of applying blind.
 */
const router = Router();
router.use(authenticate, requirePermission("imports.review"));

async function assertCompanyInAgency(companyId: string, agencyId: string): Promise<void> {
  const { rows } = await pool.query("SELECT 1 FROM companies WHERE id = $1 AND agency_id = $2", [
    companyId,
    agencyId,
  ]);
  if (rows.length === 0) throw new HttpError(404, "Company not found in this agency");
}

interface ReviewPayload {
  customer_name?: string | null;
  mobile_number?: string | null;
  product?: string | null;
  bucket?: string | null;
  due_amount?: number | null;
  emi?: number | null;
  agent_phone?: string | null;
  custom_fields?: Record<string, string>;
}

const listQuerySchema = z.object({
  company_id: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected", "superseded", "all"]).default("pending"),
  type: z.enum(["addition", "removal", "reactivation"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = listQuerySchema.parse(req.query);
    await assertCompanyInAgency(q.company_id, req.user!.agency_id);

    const conditions: string[] = ["iri.company_id = $1"];
    const params: unknown[] = [q.company_id];
    if (q.status !== "all") {
      params.push(q.status);
      conditions.push(`iri.status = $${params.length}`);
    }
    if (q.type) {
      params.push(q.type);
      conditions.push(`iri.item_type = $${params.length}`);
    }
    const where = conditions.join(" AND ");

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM import_review_items iri WHERE ${where}`,
      params,
    );

    const offset = (q.page - 1) * q.limit;
    params.push(q.limit, offset);
    const { rows } = await pool.query(
      `SELECT iri.id, iri.item_type, iri.loan_number, iri.status, iri.payload,
              iri.reviewed_by, iri.reviewed_at, iri.review_note, iri.created_at,
              ir.file_name, ir.allocation_month,
              c.customer_name AS current_customer_name, c.bucket AS current_bucket,
              c.due_amount AS current_due_amount, c.status AS current_status,
              agent.full_name AS current_agent_name
         FROM import_review_items iri
         JOIN import_runs ir ON ir.id = iri.import_run_id
         LEFT JOIN customers c ON c.id = iri.customer_id
         LEFT JOIN users agent ON agent.id = c.assigned_agent_id
        WHERE ${where}
        ORDER BY iri.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({ items: rows, total: countResult.rows[0].total, page: q.page, limit: q.limit });
  }),
);

async function loadItemForAgency(id: string, agencyId: string) {
  const { rows } = await pool.query(
    `SELECT iri.*, ir.file_name, ir.allocation_month
       FROM import_review_items iri
       JOIN import_runs ir ON ir.id = iri.import_run_id
       JOIN companies co ON co.id = iri.company_id
      WHERE iri.id = $1 AND co.agency_id = $2`,
    [id, agencyId],
  );
  if (rows.length === 0) throw new HttpError(404, "Review item not found");
  return rows[0];
}

/** Extra context so a reviewer can judge a removal without leaving the page. */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const item = await loadItemForAgency(id, req.user!.agency_id);

    let context: Record<string, unknown> = {};
    if (item.customer_id) {
      const [lastCall, pendingPtp, paidThisMonth, customer] = await Promise.all([
        pool.query(
          `SELECT remark, created_at FROM call_logs
            WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [item.customer_id],
        ),
        pool.query(
          `SELECT amount, promised_date FROM ptps
            WHERE customer_id = $1 AND status = 'pending'
            ORDER BY promised_date ASC LIMIT 1`,
          [item.customer_id],
        ),
        pool.query(
          `SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM payments
            WHERE customer_id = $1 AND paid_at >= date_trunc('month', now())`,
          [item.customer_id],
        ),
        pool.query(
          `SELECT customer_name, bucket, due_amount, emi, status, custom_fields,
                  assigned_agent_id
             FROM customers WHERE id = $1`,
          [item.customer_id],
        ),
      ]);
      context = {
        customer: customer.rows[0] ?? null,
        last_call: lastCall.rows[0] ?? null,
        pending_ptp: pendingPtp.rows[0] ?? null,
        paid_this_month: paidThisMonth.rows[0]?.total ?? 0,
      };
    }

    res.json({ item, context });
  }),
);

/** phone -> {id, team_id} for an active user of this company's agency, resolved fresh at decision time. */
async function resolveAgentByPhone(
  client: PoolClient,
  companyId: string,
  phone: string | null | undefined,
): Promise<{ id: string; team_id: string | null } | null> {
  if (!phone) return null;
  const { rows } = await client.query(
    `SELECT u.id, u.team_id FROM users u
       JOIN companies co ON co.agency_id = u.agency_id
      WHERE co.id = $1 AND u.phone = $2 AND u.is_active = true`,
    [companyId, phone],
  );
  return rows[0] ? { id: rows[0].id as string, team_id: rows[0].team_id as string | null } : null;
}

async function approveAddition(
  client: PoolClient,
  item: { id: string; company_id: string; loan_number: string; payload: ReviewPayload; allocation_month: string },
  approvedBy: string,
): Promise<void> {
  const payload = item.payload;
  const agent = await resolveAgentByPhone(client, item.company_id, payload.agent_phone);
  const inserted = await client.query(
    `INSERT INTO customers
       (company_id, loan_number, customer_name, mobile_number, product, bucket,
        due_amount, emi, custom_fields, assigned_agent_id, assigned_team_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (company_id, loan_number) DO NOTHING
     RETURNING id`,
    [
      item.company_id,
      item.loan_number,
      payload.customer_name ?? item.loan_number,
      payload.mobile_number ?? null,
      payload.product ?? null,
      payload.bucket ?? null,
      payload.due_amount ?? null,
      payload.emi ?? null,
      JSON.stringify(payload.custom_fields ?? {}),
      agent?.id ?? null,
      agent?.team_id ?? null,
    ],
  );
  if (!inserted.rows[0]) {
    throw new HttpError(
      409,
      "A customer with this loan number already exists -- this review item is stale, re-run the import to refresh the queue",
    );
  }
  const customerId = inserted.rows[0].id as string;
  if (agent) {
    await client.query(
      `INSERT INTO allocation_logs (customer_id, from_agent_id, to_agent_id, allocated_by, reason)
       VALUES ($1, NULL, $2, $3, 'Approved from import review (addition)')`,
      [customerId, agent.id, approvedBy],
    );
  }
  await client.query(
    `INSERT INTO customer_month_snapshots
       (customer_id, company_id, month, bucket, due_amount, emi, product,
        assigned_team_id, assigned_agent_id, import_run_id)
     SELECT c.id, c.company_id, $2, c.bucket, c.due_amount, c.emi, c.product,
            c.assigned_team_id, c.assigned_agent_id, NULL
       FROM customers c WHERE c.id = $1
     ON CONFLICT (customer_id, month) DO UPDATE
       SET bucket = EXCLUDED.bucket, due_amount = EXCLUDED.due_amount, emi = EXCLUDED.emi,
           product = EXCLUDED.product, assigned_team_id = EXCLUDED.assigned_team_id,
           assigned_agent_id = EXCLUDED.assigned_agent_id`,
    [customerId, item.allocation_month],
  );
}

async function approveRemoval(client: PoolClient, customerId: string): Promise<void> {
  // Mirrors how closing a customer already clears the assignment (payments.ts)
  // -- a recalled case has nothing left to work, so it shouldn't linger as
  // "assigned" to an agent even though every current query already filters
  // status='active' before checking assignment.
  const { rows } = await client.query(
    `UPDATE customers SET status = 'recalled', recalled_at = now(),
            assigned_agent_id = NULL, assigned_team_id = NULL
      WHERE id = $1 AND status = 'active' RETURNING id`,
    [customerId],
  );
  if (!rows[0]) {
    throw new HttpError(
      409,
      "Customer is no longer active -- this review item is stale (already recalled or closed)",
    );
  }
}

async function approveReactivation(
  client: PoolClient,
  item: { id: string; company_id: string; customer_id: string; payload: ReviewPayload; allocation_month: string },
  approvedBy: string,
): Promise<void> {
  const payload = item.payload;
  const agent = await resolveAgentByPhone(client, item.company_id, payload.agent_phone);
  const existing = await client.query(
    `SELECT id, assigned_agent_id FROM customers WHERE id = $1 FOR UPDATE`,
    [item.customer_id],
  );
  const cust = existing.rows[0];
  if (!cust) throw new HttpError(404, "Customer no longer exists");
  await client.query(
    `UPDATE customers
        SET status = 'active', recalled_at = NULL,
            customer_name = COALESCE($2, customer_name),
            mobile_number = COALESCE($3, mobile_number),
            product = COALESCE($4, product),
            bucket = COALESCE($5, bucket),
            due_amount = COALESCE($6, due_amount),
            emi = COALESCE($7, emi),
            custom_fields = custom_fields || $8::jsonb,
            assigned_agent_id = COALESCE($9, assigned_agent_id),
            assigned_team_id = COALESCE($10, assigned_team_id)
      WHERE id = $1`,
    [
      item.customer_id,
      payload.customer_name ?? null,
      payload.mobile_number ?? null,
      payload.product ?? null,
      payload.bucket ?? null,
      payload.due_amount ?? null,
      payload.emi ?? null,
      JSON.stringify(payload.custom_fields ?? {}),
      agent?.id ?? null,
      agent?.team_id ?? null,
    ],
  );
  if (agent && cust.assigned_agent_id !== agent.id) {
    await client.query(
      `INSERT INTO allocation_logs (customer_id, from_agent_id, to_agent_id, allocated_by, reason)
       VALUES ($1, $2, $3, $4, 'Approved from import review (reactivation)')`,
      [item.customer_id, cust.assigned_agent_id, agent.id, approvedBy],
    );
  }
  await client.query(
    `INSERT INTO customer_month_snapshots
       (customer_id, company_id, month, bucket, due_amount, emi, product,
        assigned_team_id, assigned_agent_id, import_run_id)
     SELECT c.id, c.company_id, $2, c.bucket, c.due_amount, c.emi, c.product,
            c.assigned_team_id, c.assigned_agent_id, NULL
       FROM customers c WHERE c.id = $1
     ON CONFLICT (customer_id, month) DO UPDATE
       SET bucket = EXCLUDED.bucket, due_amount = EXCLUDED.due_amount, emi = EXCLUDED.emi,
           product = EXCLUDED.product, assigned_team_id = EXCLUDED.assigned_team_id,
           assigned_agent_id = EXCLUDED.assigned_agent_id`,
    [item.customer_id, item.allocation_month],
  );
}

const decisionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional(),
});

/** Applies one decision inside an already-open transaction; throws on stale/invalid state. */
async function applyDecision(
  client: PoolClient,
  itemId: string,
  agencyId: string,
  decidedBy: string,
  action: "approve" | "reject",
  note: string | undefined,
): Promise<void> {
  const { rows } = await client.query(
    `SELECT iri.*, ir.allocation_month
       FROM import_review_items iri
       JOIN import_runs ir ON ir.id = iri.import_run_id
       JOIN companies co ON co.id = iri.company_id
      WHERE iri.id = $1 AND co.agency_id = $2 FOR UPDATE OF iri`,
    [itemId, agencyId],
  );
  const item = rows[0];
  if (!item) throw new HttpError(404, "Review item not found");
  if (item.status !== "pending") {
    throw new HttpError(409, `This item is already ${item.status}, not pending`);
  }

  if (action === "approve") {
    if (item.item_type === "addition") {
      await approveAddition(client, item, decidedBy);
    } else if (item.item_type === "removal") {
      await approveRemoval(client, item.customer_id);
    } else {
      await approveReactivation(client, item, decidedBy);
    }
  }

  await client.query(
    `UPDATE import_review_items
        SET status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4
      WHERE id = $1`,
    [itemId, action === "approve" ? "approved" : "rejected", decidedBy, note ?? null],
  );
}

router.post(
  "/:id/decision",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const body = decisionSchema.parse(req.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await applyDecision(client, id, req.user!.agency_id, req.user!.id, body.action, body.note);
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

const bulkDecisionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional(),
});

router.post(
  "/bulk-decision",
  asyncHandler(async (req, res) => {
    const body = bulkDecisionSchema.parse(req.body);
    const applied: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const id of body.ids) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await applyDecision(client, id, req.user!.agency_id, req.user!.id, body.action, body.note);
        await client.query("COMMIT");
        applied.push(id);
      } catch (err) {
        await client.query("ROLLBACK");
        skipped.push({ id, reason: err instanceof HttpError ? err.message : "Unexpected error" });
      } finally {
        client.release();
      }
    }
    res.json({ applied, skipped });
  }),
);

export default router;
