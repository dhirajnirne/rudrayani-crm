import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";
import { HttpError } from "../middleware/error-handler";
import { SYSTEM_FIELDS } from "../services/import-service";

const router = Router();
router.use(authenticate, requirePermission("imports.manage"));

const mappingSchema = z.record(z.string().min(1), z.enum(SYSTEM_FIELDS));

const createSchema = z.object({
  company_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  column_mapping: mappingSchema,
  // Source columns (mapped or not) to keep as "customer detail" fields shown
  // in the customer 360 view (Phase 7). Empty values there render as "-".
  detail_fields: z.array(z.string().min(1)).max(100).default([]),
});

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const companyId = z.string().uuid().parse(req.query.company_id);
    const { rows } = await pool.query(
      `SELECT t.id, t.name, t.version, t.is_active, t.column_mapping, t.detail_fields,
              t.created_at, t.updated_at
         FROM import_templates t
         JOIN companies c ON c.id = t.company_id
        WHERE t.company_id = $1 AND c.agency_id = $2
        ORDER BY t.name, t.version DESC`,
      [companyId, req.user!.agency_id],
    );
    res.json({ templates: rows });
  }),
);

/**
 * Creating a template with a name that already exists for the company makes a
 * NEW VERSION (the old one is deactivated but kept — brief §4: templates are
 * editable/versionable when a company changes their sheet layout).
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const company = await pool.query("SELECT 1 FROM companies WHERE id = $1 AND agency_id = $2", [
      body.company_id,
      req.user!.agency_id,
    ]);
    if (company.rows.length === 0) throw new HttpError(404, "Company not found in this agency");

    const mappedFields = Object.values(body.column_mapping);
    for (const required of ["loan_number", "customer_name"] as const) {
      if (!mappedFields.includes(required)) {
        throw new HttpError(400, `The template must map a column to "${required}"`);
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const prev = await client.query(
        `UPDATE import_templates SET is_active = false, updated_at = now()
          WHERE company_id = $1 AND name = $2 AND is_active = true
          RETURNING version`,
        [body.company_id, body.name],
      );
      const version = prev.rows.length > 0 ? prev.rows[0].version + 1 : 1;
      const { rows } = await client.query(
        `INSERT INTO import_templates (company_id, name, column_mapping, detail_fields, version, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, version, is_active, column_mapping, detail_fields, created_at`,
        [
          body.company_id,
          body.name,
          JSON.stringify(body.column_mapping),
          JSON.stringify(body.detail_fields),
          version,
          req.user!.id,
        ],
      );
      await client.query("COMMIT");
      res.status(201).json({ template: rows[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }),
);

export default router;
