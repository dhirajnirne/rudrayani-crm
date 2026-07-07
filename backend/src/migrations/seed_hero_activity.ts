/**
 * Dev-only: populates realistic collection activity (agent assignment, calls,
 * PTPs, payments) on top of a book that has already been imported for real
 * (e.g. via the Import wizard), so the app shows a lived-in view instead of
 * an empty dashboard. Reads each customer's real EMI/POS figures out of
 * custom_fields when the mapped columns weren't set, so amounts stay
 * consistent with the actual allocation file. Idempotent per customer: a
 * customer that already has a call log is left alone on re-run.
 *
 * Usage: npm run seed:activity -- "<Company Name>" [perBucket]
 *        (default perBucket = 6 -- customers sampled per distinct bucket label)
 */
import { pool } from "../config/db";
import { detectPaymentNormalization } from "../services/bucket-movement-service";

interface CustomerRow {
  id: string;
  loan_number: string;
  customer_name: string;
  bucket: string;
  assigned_agent_id: string | null;
  due_amount: string | null;
  emi: string | null;
  custom_fields: Record<string, unknown>;
}

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function resolveAmounts(c: CustomerRow): { pos: number; emi: number } {
  const cf = c.custom_fields ?? {};
  const pos =
    parseNum(c.due_amount) ?? parseNum(cf.pos) ?? parseNum(cf.tos) ?? parseNum(cf.loan_amount) ?? 20000;
  const emi =
    parseNum(c.emi) ?? parseNum(cf.emi_amount) ?? parseNum(cf.emi_due) ?? Math.round(pos / 12);
  return { pos, emi };
}

function pick<T>(items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [item, w] of items) {
    if ((r -= w) <= 0) return item;
  }
  return items[items.length - 1][0];
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const REMARKS: Record<string, string[]> = {
  RNR: ["Rang multiple times, no response.", "No answer after 3 attempts.", "Phone rang out."],
  NC: ["Number not reachable / switched off.", "Not contactable today, will retry tomorrow."],
  WRN: ["Confirmed wrong number, does not belong to customer.", "Number picked up by unrelated person."],
  CB: ["Asked to call back in the evening.", "Customer busy at work, requested call back later.", "Will discuss after checking with family."],
  PU: ["Call connected, discussing repayment options.", "Spoke to customer, explaining overdue amount."],
  BP: ["Customer did not honor the earlier promise. Re-negotiating.", "Follow-up on broken promise from last week."],
};

async function main(): Promise<void> {
  const companyName = process.argv[2] ?? "Hero FinCorp";
  const perBucket = Number(process.argv[3] ?? 6);

  const { rows: companies } = await pool.query(
    "SELECT id, agency_id FROM companies WHERE lower(name) = lower($1) LIMIT 1",
    [companyName],
  );
  if (!companies[0]) {
    console.error(`Company "${companyName}" not found.`);
    process.exit(1);
  }
  const companyId = companies[0].id as string;
  const agencyId = companies[0].agency_id as string;

  const { rows: agentRows } = await pool.query(
    `SELECT id, phone, is_telecaller, is_field_agent, is_operations_manager
       FROM users WHERE agency_id = $1 AND (is_telecaller OR is_field_agent OR is_operations_manager)`,
    [agencyId],
  );
  const telecaller = agentRows.find((r) => r.is_telecaller);
  const fieldAgent = agentRows.find((r) => r.is_field_agent);
  const opsManager = agentRows.find((r) => r.is_operations_manager);
  if (!telecaller || !fieldAgent || !opsManager) {
    console.error("Missing telecaller/field agent/ops manager users -- run seed:demo first.");
    process.exit(1);
  }

  const { rows: dispoRows } = await pool.query(
    `SELECT id, result_code FROM disposition_codes
      WHERE agency_id = $1 AND result_code IN ('RNR','NC','WRN','CB','PU','PTP','BP') AND is_active = true`,
    [agencyId],
  );
  const dispoByCode = new Map<string, string>();
  for (const r of dispoRows) if (!dispoByCode.has(r.result_code)) dispoByCode.set(r.result_code, r.id);
  const required = ["RNR", "NC", "WRN", "CB", "PU", "PTP", "BP"];
  const missingCodes = required.filter((c) => !dispoByCode.has(c));
  if (missingCodes.length > 0) {
    console.error(`Missing disposition codes: ${missingCodes.join(", ")} -- run seed:dispositions first.`);
    process.exit(1);
  }

  // Sample up to `perBucket` customers per distinct bucket label, prioritizing
  // any already assigned so the user's own manual test assignments are included.
  const { rows: sample } = await pool.query<CustomerRow>(
    `WITH ranked AS (
       SELECT *, row_number() OVER (
         PARTITION BY bucket ORDER BY (assigned_agent_id IS NOT NULL) DESC, random()
       ) AS rn
       FROM customers WHERE company_id = $1 AND status = 'active'
     )
     SELECT id, loan_number, customer_name, bucket, assigned_agent_id, due_amount, emi, custom_fields
     FROM ranked WHERE rn <= $2`,
    [companyId, perBucket],
  );

  console.log(`Sampled ${sample.length} customers across buckets for company "${companyName}".`);

  let newlyAssigned = 0;
  let callsCreated = 0;
  let ptpsCreated = 0;
  let ptpKept = 0;
  let ptpBroken = 0;
  let ptpPending = 0;
  let paymentsCreated = 0;
  let paymentsTotal = 0;

  for (let idx = 0; idx < sample.length; idx++) {
    const cust = sample[idx];
    let agentId = cust.assigned_agent_id;

    if (!agentId) {
      agentId = idx % 2 === 0 ? telecaller.id : fieldAgent.id;
      await pool.query(
        `UPDATE customers SET assigned_agent_id = $2 WHERE id = $1`,
        [cust.id, agentId],
      );
      await pool.query(
        `INSERT INTO allocation_logs (customer_id, from_agent_id, to_agent_id, allocated_by, reason)
         VALUES ($1, NULL, $2, $3, 'Test allocation to exercise full workflow before go-live')`,
        [cust.id, agentId, opsManager.id],
      );
      newlyAssigned++;
    }

    const { rows: existingCalls } = await pool.query(
      "SELECT 1 FROM call_logs WHERE customer_id = $1 LIMIT 1",
      [cust.id],
    );
    if (existingCalls.length > 0) continue; // already has trail from a previous run

    const { pos, emi } = resolveAmounts(cust);
    const numCalls = 1 + Math.floor(Math.random() * 3);

    for (let i = 0; i < numCalls; i++) {
      const callAt = daysAgo(1 + Math.floor(Math.random() * 9));
      const code = pick<string>([
        ["RNR", 25],
        ["NC", 10],
        ["WRN", 5],
        ["CB", 15],
        ["PU", 12],
        ["PTP", 23],
        ["BP", 10],
      ]);
      const dispositionId = dispoByCode.get(code)!;
      const remarkOptions = REMARKS[code] ?? ["Follow-up call made."];
      const remark = remarkOptions[Math.floor(Math.random() * remarkOptions.length)];
      const durationSeconds = 20 + Math.floor(Math.random() * 220);

      if (code === "PTP") {
        const amount = Math.max(500, Math.round(Math.min(pos, emi * (1 + Math.random() * 2)) / 100) * 100);
        const isPast = Math.random() < 0.5;
        const promisedDate = isPast
          ? toDateOnly(daysAgo(1 + Math.floor(Math.random() * 5)))
          : toDateOnly(daysFromNow(1 + Math.floor(Math.random() * 7)));
        const fullRemark = `Customer promised to pay ₹${amount} by ${promisedDate}. ${remark}`;

        const { rows: callRows } = await pool.query(
          `INSERT INTO call_logs (customer_id, agent_id, disposition_code_id, remark, call_duration_seconds, details, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [
            cust.id,
            agentId,
            dispositionId,
            fullRemark,
            durationSeconds,
            JSON.stringify({ amount, date: promisedDate }),
            callAt,
          ],
        );
        callsCreated++;

        let status: "kept" | "broken" | "pending" = "pending";
        if (isPast) status = Math.random() < 0.6 ? "kept" : "broken";
        const { rows: ptpRows } = await pool.query(
          `INSERT INTO ptps (customer_id, call_log_id, agent_id, amount, promised_date, mode, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [cust.id, callRows[0].id, agentId, amount, promisedDate, "cash", status, callAt],
        );
        ptpsCreated++;
        if (status === "kept") ptpKept++;
        else if (status === "broken") ptpBroken++;
        else ptpPending++;

        if (status === "kept") {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            const payRes = await client.query(
              `INSERT INTO payments (customer_id, collected_by_user_id, amount, mode, paid_at)
               VALUES ($1, $2, $3, 'cash', $4::date) RETURNING id`,
              [cust.id, agentId, amount, promisedDate],
            );
            await detectPaymentNormalization(client, cust.id, payRes.rows[0].id);
            await client.query("COMMIT");
          } catch (err) {
            await client.query("ROLLBACK");
            throw err;
          } finally {
            client.release();
          }
          paymentsCreated++;
          paymentsTotal += amount;
          void ptpRows;
        }
      } else {
        await pool.query(
          `INSERT INTO call_logs (customer_id, agent_id, disposition_code_id, remark, call_duration_seconds, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [cust.id, agentId, dispositionId, remark, durationSeconds, callAt],
        );
        callsCreated++;
      }
    }

    // A minority of customers also make a direct part-payment unrelated to a PTP.
    if (Math.random() < 0.25) {
      const amount = Math.max(500, Math.round((emi * (0.3 + Math.random() * 0.6)) / 100) * 100);
      const paidAt = toDateOnly(daysAgo(1 + Math.floor(Math.random() * 6)));
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const payRes = await client.query(
          `INSERT INTO payments (customer_id, collected_by_user_id, amount, mode, paid_at)
           VALUES ($1, $2, $3, 'upi', $4::date) RETURNING id`,
          [cust.id, agentId, amount, paidAt],
        );
        await detectPaymentNormalization(client, cust.id, payRes.rows[0].id);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
      paymentsCreated++;
      paymentsTotal += amount;
    }
  }

  console.log(`
Done.
  Newly assigned customers : ${newlyAssigned} (split between ${telecaller.phone} and ${fieldAgent.phone})
  Call logs created        : ${callsCreated}
  PTPs created             : ${ptpsCreated}  (kept ${ptpKept}, broken ${ptpBroken}, pending ${ptpPending})
  Payments recorded        : ${paymentsCreated}  totalling ~Rs.${paymentsTotal.toLocaleString("en-IN")}

Note: canonical bucket mapping is not set for "${companyName}" (real lender bucket
labels: check the Buckets page). Bucket-movement detection ran but will silently
no-op until an admin maps each label to a canonical DPD bucket -- that's expected,
not an error.
`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
