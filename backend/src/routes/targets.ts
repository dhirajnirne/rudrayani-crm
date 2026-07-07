import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";
import { HttpError } from "../middleware/error-handler";
import { parseWorkbook } from "../services/import-service";

/**
 * Monthly targets (Phase 5 dashboard). Admin/ops set a ₹ amount and/or an
 * account count per metric at agency / branch / team / agent scope, optionally
 * narrowed to a company, product or bucket. The dashboard resolves the most
 * specific matching target.
 */
const router = Router();
router.use(authenticate, requirePermission("targets.manage"));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const METRICS = ["resolution", "rollback", "normalization", "recovery", "collection"] as const;
const SCOPE_TYPES = ["agency", "branch", "team", "agent"] as const;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthSchema = z
  .string()
  .regex(MONTH_RE, "month must be YYYY-MM")
  .transform((m) => `${m}-01`);

/** scope_id must exist inside the caller's agency for its scope_type. */
async function assertScopeInAgency(
  scopeType: (typeof SCOPE_TYPES)[number],
  scopeId: string | null,
  agencyId: string,
): Promise<void> {
  if (scopeType === "agency") return;
  if (!scopeId) throw new HttpError(400, `scope_id is required for scope_type "${scopeType}"`);
  const queries: Record<string, string> = {
    branch: "SELECT 1 FROM branches WHERE id = $1 AND agency_id = $2",
    team: `SELECT 1 FROM teams t JOIN branches b ON b.id = t.branch_id
            WHERE t.id = $1 AND b.agency_id = $2`,
    agent: "SELECT 1 FROM users WHERE id = $1 AND agency_id = $2",
  };
  const { rows } = await pool.query(queries[scopeType], [scopeId, agencyId]);
  if (rows.length === 0) throw new HttpError(404, `${scopeType} not found in this agency`);
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        month: monthSchema,
        scope_type: z.enum(SCOPE_TYPES).optional(),
        metric: z.enum(METRICS).optional(),
        company_id: z.string().uuid().optional(),
      })
      .parse(req.query);

    const conditions = ["t.agency_id = $1", "t.month = $2"];
    const params: unknown[] = [req.user!.agency_id, query.month];
    if (query.scope_type) {
      params.push(query.scope_type);
      conditions.push(`t.scope_type = $${params.length}`);
    }
    if (query.metric) {
      params.push(query.metric);
      conditions.push(`t.metric = $${params.length}`);
    }
    if (query.company_id) {
      params.push(query.company_id);
      conditions.push(`t.company_id = $${params.length}`);
    }

    const { rows } = await pool.query(
      `SELECT t.id, t.month, t.metric, t.scope_type, t.scope_id, t.company_id,
              t.product, t.bucket, t.target_amount, t.target_count,
              CASE t.scope_type
                WHEN 'branch' THEN br.name
                WHEN 'team'   THEN tm.name
                WHEN 'agent'  THEN u.full_name
                ELSE 'Agency'
              END AS scope_name,
              co.name AS company_name
         FROM targets t
         LEFT JOIN branches br ON br.id = t.scope_id AND t.scope_type = 'branch'
         LEFT JOIN teams tm    ON tm.id = t.scope_id AND t.scope_type = 'team'
         LEFT JOIN users u     ON u.id = t.scope_id AND t.scope_type = 'agent'
         LEFT JOIN companies co ON co.id = t.company_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY t.scope_type, scope_name, t.metric`,
      params,
    );
    res.json({ targets: rows });
  }),
);

const bulkRowSchema = z.object({
  metric: z.enum(METRICS),
  scope_type: z.enum(SCOPE_TYPES),
  scope_id: z.string().uuid().nullish(),
  company_id: z.string().uuid().nullish(),
  product: z.string().trim().min(1).max(200).nullish(),
  bucket: z.string().trim().min(1).max(200).nullish(),
  target_amount: z.number().nonnegative().nullish(),
  target_count: z.number().int().nonnegative().nullish(),
});

const bulkSchema = z.object({
  month: monthSchema,
  rows: z.array(bulkRowSchema).min(1).max(500),
});

/** Upsert per dimension combination; a row with both values null deletes. */
router.put(
  "/bulk",
  asyncHandler(async (req, res) => {
    const body = bulkSchema.parse(req.body);
    const agencyId = req.user!.agency_id;

    for (const row of body.rows) {
      await assertScopeInAgency(row.scope_type, row.scope_id ?? null, agencyId);
      if (row.company_id) {
        const { rows } = await pool.query(
          "SELECT 1 FROM companies WHERE id = $1 AND agency_id = $2",
          [row.company_id, agencyId],
        );
        if (rows.length === 0) throw new HttpError(404, "Company not found in this agency");
      }
    }

    const client = await pool.connect();
    let upserted = 0;
    let deleted = 0;
    try {
      await client.query("BEGIN");
      for (const row of body.rows) {
        const dims = [
          agencyId,
          body.month,
          row.metric,
          row.scope_type,
          row.scope_id ?? null,
          row.company_id ?? null,
          row.product ?? null,
          row.bucket ?? null,
        ];
        if (row.target_amount == null && row.target_count == null) {
          const del = await client.query(
            `DELETE FROM targets
              WHERE agency_id = $1 AND month = $2 AND metric = $3 AND scope_type = $4
                AND COALESCE(scope_id, '00000000-0000-0000-0000-000000000000')
                    = COALESCE($5::uuid, '00000000-0000-0000-0000-000000000000')
                AND COALESCE(company_id, '00000000-0000-0000-0000-000000000000')
                    = COALESCE($6::uuid, '00000000-0000-0000-0000-000000000000')
                AND COALESCE(product, '') = COALESCE($7, '')
                AND COALESCE(bucket, '') = COALESCE($8, '')`,
            dims,
          );
          deleted += del.rowCount ?? 0;
        } else {
          await client.query(
            `INSERT INTO targets
               (agency_id, month, metric, scope_type, scope_id, company_id, product, bucket,
                target_amount, target_count, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (agency_id, month, metric, scope_type,
                          COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'),
                          COALESCE(company_id, '00000000-0000-0000-0000-000000000000'),
                          COALESCE(product, ''), COALESCE(bucket, ''))
             DO UPDATE SET target_amount = EXCLUDED.target_amount,
                           target_count = EXCLUDED.target_count,
                           created_by = EXCLUDED.created_by,
                           updated_at = now()`,
            [...dims, row.target_amount ?? null, row.target_count ?? null, req.user!.id],
          );
          upserted += 1;
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    res.json({ ok: true, upserted, deleted });
  }),
);

/**
 * Excel import — fixed columns: Month (YYYY-MM), Metric, Scope Type,
 * Scope Name/Phone, Company (optional), Product (optional), Bucket (optional),
 * Target Amount, Target Count. Branch/team resolve by name, agent by phone.
 */
router.post(
  "/import",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Attach the Excel file as the 'file' field");
    const agencyId = req.user!.agency_id;
    const sheet = await parseWorkbook(req.file.buffer);

    const col = (record: Record<string, string>, ...names: string[]): string => {
      for (const name of names) {
        const key = sheet.columns.find((c) => c.trim().toLowerCase() === name);
        if (key && record[key]) return record[key];
      }
      return "";
    };

    const errors: { row: number; problem: string }[] = [];
    const rows: {
      month: string;
      metric: (typeof METRICS)[number];
      scope_type: (typeof SCOPE_TYPES)[number];
      scope_id: string | null;
      company_id: string | null;
      product: string | null;
      bucket: string | null;
      target_amount: number | null;
      target_count: number | null;
    }[] = [];

    for (const record of sheet.rows) {
      const excelRow = Number(record.__excelRow);
      const month = col(record, "month");
      const metric = col(record, "metric").toLowerCase();
      const scopeType = col(record, "scope type", "scope_type").toLowerCase();
      const scopeName = col(record, "scope name/phone", "scope name", "scope");
      const companyName = col(record, "company");
      const product = col(record, "product") || null;
      const bucket = col(record, "bucket") || null;
      const amountRaw = col(record, "target amount", "target_amount");
      const countRaw = col(record, "target count", "target_count");

      if (!MONTH_RE.test(month)) {
        errors.push({ row: excelRow, problem: `Month must be YYYY-MM, got "${month}"` });
        continue;
      }
      if (!METRICS.includes(metric as never)) {
        errors.push({ row: excelRow, problem: `Unknown metric "${metric}"` });
        continue;
      }
      if (!SCOPE_TYPES.includes(scopeType as never)) {
        errors.push({ row: excelRow, problem: `Unknown scope type "${scopeType}"` });
        continue;
      }

      let scopeId: string | null = null;
      if (scopeType !== "agency") {
        if (!scopeName) {
          errors.push({ row: excelRow, problem: `Scope name/phone required for ${scopeType}` });
          continue;
        }
        const lookups: Record<string, { sql: string; params: unknown[] }> = {
          branch: {
            sql: "SELECT id FROM branches WHERE agency_id = $1 AND lower(name) = lower($2)",
            params: [agencyId, scopeName],
          },
          team: {
            sql: `SELECT t.id FROM teams t JOIN branches b ON b.id = t.branch_id
                   WHERE b.agency_id = $1 AND lower(t.name) = lower($2)`,
            params: [agencyId, scopeName],
          },
          agent: {
            sql: "SELECT id FROM users WHERE agency_id = $1 AND phone = $2",
            params: [agencyId, scopeName],
          },
        };
        const { rows: found } = await pool.query(lookups[scopeType].sql, lookups[scopeType].params);
        if (found.length === 0) {
          errors.push({ row: excelRow, problem: `${scopeType} "${scopeName}" not found` });
          continue;
        }
        scopeId = found[0].id as string;
      }

      let companyId: string | null = null;
      if (companyName) {
        const { rows: found } = await pool.query(
          "SELECT id FROM companies WHERE agency_id = $1 AND lower(name) = lower($2)",
          [agencyId, companyName],
        );
        if (found.length === 0) {
          errors.push({ row: excelRow, problem: `Company "${companyName}" not found` });
          continue;
        }
        companyId = found[0].id as string;
      }

      const amount = amountRaw ? Number(amountRaw.replace(/[,\s₹]/g, "")) : null;
      const count = countRaw ? Number(countRaw.replace(/[,\s]/g, "")) : null;
      if ((amount !== null && Number.isNaN(amount)) || (count !== null && Number.isNaN(count))) {
        errors.push({ row: excelRow, problem: "Target amount/count is not a number" });
        continue;
      }
      if (amount === null && count === null) {
        errors.push({ row: excelRow, problem: "Provide a target amount or count" });
        continue;
      }

      rows.push({
        month: `${month}-01`,
        metric: metric as (typeof METRICS)[number],
        scope_type: scopeType as (typeof SCOPE_TYPES)[number],
        scope_id: scopeId,
        company_id: companyId,
        product,
        bucket,
        target_amount: amount,
        target_count: count,
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const row of rows) {
        await client.query(
          `INSERT INTO targets
             (agency_id, month, metric, scope_type, scope_id, company_id, product, bucket,
              target_amount, target_count, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (agency_id, month, metric, scope_type,
                        COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'),
                        COALESCE(company_id, '00000000-0000-0000-0000-000000000000'),
                        COALESCE(product, ''), COALESCE(bucket, ''))
           DO UPDATE SET target_amount = EXCLUDED.target_amount,
                         target_count = EXCLUDED.target_count,
                         created_by = EXCLUDED.created_by,
                         updated_at = now()`,
          [
            req.user!.agency_id,
            row.month,
            row.metric,
            row.scope_type,
            row.scope_id,
            row.company_id,
            row.product,
            row.bucket,
            row.target_amount,
            row.target_count,
            req.user!.id,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    res.json({ imported: rows.length, error_rows: errors.length, errors: errors.slice(0, 50) });
  }),
);

export default router;
