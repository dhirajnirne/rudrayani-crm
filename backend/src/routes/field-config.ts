import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";
import { HttpError } from "../middleware/error-handler";
import {
  STRUCTURALLY_REQUIRED_FIELDS,
  ensureAgencyFieldDefinitions,
  listAgencyDefinitions,
  resolveFieldCatalog,
} from "../services/field-config-service";

/**
 * Owner feedback round, Phase 10: admin surface for the system field master
 * catalog (system_field_definitions, agency-wide) and per-company
 * configuration (company_field_settings) that import-service.ts now resolves
 * at runtime instead of reading the old compile-time SYSTEM_FIELDS const.
 * Gated the same as the rest of the admin config surfaces (buckets.ts,
 * companies.ts): companies.manage.
 */
const router = Router();
router.use(authenticate, requirePermission("companies.manage"));

async function assertCompanyInAgency(companyId: string, agencyId: string): Promise<void> {
  const { rows } = await pool.query("SELECT 1 FROM companies WHERE id = $1 AND agency_id = $2", [
    companyId,
    agencyId,
  ]);
  if (rows.length === 0) throw new HttpError(404, "Company not found in this agency");
}

/** Agency-wide master catalog (core fields + any admin-added ones). */
router.get(
  "/definitions",
  asyncHandler(async (req, res) => {
    const definitions = await listAgencyDefinitions(req.user!.agency_id);
    res.json({ definitions });
  }),
);

const fieldKeySchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]{1,49}$/, "Use lowercase letters, digits and underscores, starting with a letter");

const createDefinitionSchema = z.object({
  field_key: fieldKeySchema,
  label: z.string().trim().min(1).max(200),
  // 'resolver' is reserved for the built-in agent_phone field -- an
  // admin-added field always has no native customers column, so it can only
  // ever be a plain custom_fields value (text/numeric/date parsing at import).
  field_type: z.enum(["text", "numeric", "date"]),
});

/** Add a custom field to the agency's master catalog. Always is_core=false,
 *  storage_column=NULL -- it routes into custom_fields, same as "address". */
router.post(
  "/definitions",
  asyncHandler(async (req, res) => {
    const body = createDefinitionSchema.parse(req.body);
    await ensureAgencyFieldDefinitions(pool, req.user!.agency_id);
    const nextSortOrder = await pool.query(
      `SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM system_field_definitions WHERE agency_id = $1`,
      [req.user!.agency_id],
    );
    try {
      const { rows } = await pool.query(
        `INSERT INTO system_field_definitions
           (agency_id, field_key, label, storage_column, field_type, is_core, sort_order)
         VALUES ($1, $2, $3, NULL, $4, false, $5)
         RETURNING id, field_key, label, storage_column, field_type, is_core, sort_order, created_at`,
        [req.user!.agency_id, body.field_key, body.label, body.field_type, nextSortOrder.rows[0].next],
      );
      res.status(201).json({ definition: rows[0] });
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
        throw new HttpError(409, `Field key "${body.field_key}" already exists for this agency`);
      }
      throw err;
    }
  }),
);

/** Remove a custom field entirely (never allowed for is_core=true -- brief:
 *  "do not hard-delete is_core=true definitions, disable only"). Also drops
 *  any per-company settings referencing it so it can't leave orphaned rows. */
router.delete(
  "/definitions/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const { rows } = await pool.query(
      `SELECT field_key, is_core FROM system_field_definitions WHERE id = $1 AND agency_id = $2`,
      [id, req.user!.agency_id],
    );
    if (!rows[0]) throw new HttpError(404, "Field definition not found");
    if (rows[0].is_core) {
      throw new HttpError(400, "Core fields can't be deleted — disable them per company instead");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM company_field_settings
          WHERE field_key = $1
            AND company_id IN (SELECT id FROM companies WHERE agency_id = $2)`,
        [rows[0].field_key, req.user!.agency_id],
      );
      await client.query(`DELETE FROM system_field_definitions WHERE id = $1`, [id]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    res.status(204).end();
  }),
);

/** Resolved catalog for one company -- the per-company toggle table. */
router.get(
  "/settings",
  asyncHandler(async (req, res) => {
    const companyId = z.string().uuid().parse(req.query.company_id);
    await assertCompanyInAgency(companyId, req.user!.agency_id);
    const catalog = await resolveFieldCatalog(companyId);
    res.json({ fields: catalog });
  }),
);

const upsertSettingSchema = z
  .object({
    company_id: z.string().uuid(),
    field_key: z.string().min(1),
    is_enabled: z.boolean().optional(),
    is_required: z.boolean().optional(),
  })
  .refine((b) => b.is_enabled !== undefined || b.is_required !== undefined, {
    message: "Nothing to update",
  });

/** Enable/disable or require/un-require one field for one company. Upserts
 *  (a company may not have a settings row for this field_key yet). */
router.patch(
  "/settings",
  asyncHandler(async (req, res) => {
    const body = upsertSettingSchema.parse(req.body);
    await assertCompanyInAgency(body.company_id, req.user!.agency_id);
    await ensureAgencyFieldDefinitions(pool, req.user!.agency_id);

    if (STRUCTURALLY_REQUIRED_FIELDS.includes(body.field_key) && body.is_enabled === false) {
      throw new HttpError(
        400,
        `"${body.field_key}" can't be disabled — the import pipeline depends on it directly`,
      );
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT is_enabled, is_required, sort_order FROM company_field_settings
          WHERE company_id = $1 AND field_key = $2`,
        [body.company_id, body.field_key],
      );
      // A required field must be mappable -- if this call flips is_required
      // to true without also touching is_enabled, force it on too.
      const wantEnabled = body.is_enabled ?? (body.is_required ? true : current.rows[0]?.is_enabled ?? true);
      const wantRequired = body.is_required ?? current.rows[0]?.is_required ?? false;
      if (wantRequired && !wantEnabled) {
        throw new HttpError(400, "A required field must also be enabled");
      }
      const defaultSort = await client.query(
        `SELECT sort_order FROM system_field_definitions WHERE agency_id = $1 AND field_key = $2`,
        [req.user!.agency_id, body.field_key],
      );
      if (!defaultSort.rows[0]) throw new HttpError(404, "Field is not part of this agency's catalog");
      const sortOrder = current.rows[0]?.sort_order ?? defaultSort.rows[0].sort_order;

      const { rows } = await client.query(
        `INSERT INTO company_field_settings (company_id, field_key, is_enabled, is_required, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (company_id, field_key) DO UPDATE
           SET is_enabled = $3, is_required = $4, updated_at = now()
         RETURNING company_id, field_key, is_enabled, is_required, sort_order`,
        [body.company_id, body.field_key, wantEnabled, wantRequired, sortOrder],
      );
      await client.query("COMMIT");
      res.json({ setting: rows[0] });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }),
);

const reorderSchema = z.object({
  company_id: z.string().uuid(),
  ordered_field_keys: z.array(z.string().min(1)).min(1),
});

/** Full reorder for one company's field list, mirrors PUT /buckets/reorder. */
router.put(
  "/settings/reorder",
  asyncHandler(async (req, res) => {
    const body = reorderSchema.parse(req.body);
    await assertCompanyInAgency(body.company_id, req.user!.agency_id);

    const catalog = await resolveFieldCatalog(body.company_id);
    const known = new Set(catalog.map((f) => f.field_key));
    if (
      known.size !== body.ordered_field_keys.length ||
      body.ordered_field_keys.some((k) => !known.has(k))
    ) {
      throw new HttpError(400, "ordered_field_keys must contain every field of the company exactly once");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < body.ordered_field_keys.length; i++) {
        const key = body.ordered_field_keys[i];
        const existing = catalog.find((f) => f.field_key === key)!;
        await client.query(
          `INSERT INTO company_field_settings (company_id, field_key, is_enabled, is_required, sort_order)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (company_id, field_key) DO UPDATE SET sort_order = $5, updated_at = now()`,
          [body.company_id, key, existing.is_enabled, existing.is_required, i],
        );
      }
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

export default router;
