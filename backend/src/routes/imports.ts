import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";
import { HttpError } from "../middleware/error-handler";
import {
  SYSTEM_FIELDS,
  commitImport,
  parseWorkbook,
  validateRows,
  type ColumnMapping,
} from "../services/import-service";
import { getStorage } from "../services/storage/storage-provider";

const router = Router();
router.use(authenticate, requirePermission("imports.manage"));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

const mappingSchema = z.record(z.string().min(1), z.enum(SYSTEM_FIELDS));
const uploadKeySchema = z
  .string()
  .regex(/^imports\/[a-f0-9-]+\.xlsx$/, "Invalid upload reference");

async function assertCompanyInAgency(companyId: string, agencyId: string): Promise<void> {
  const { rows } = await pool.query("SELECT 1 FROM companies WHERE id = $1 AND agency_id = $2", [
    companyId,
    agencyId,
  ]);
  if (rows.length === 0) throw new HttpError(404, "Company not found in this agency");
}

async function resolveMapping(
  agencyId: string,
  companyId: string,
  templateId: string | undefined,
  rawMapping: unknown,
): Promise<{ mapping: ColumnMapping; templateId: string | null }> {
  if (templateId) {
    const { rows } = await pool.query(
      `SELECT t.column_mapping FROM import_templates t
         JOIN companies c ON c.id = t.company_id
        WHERE t.id = $1 AND t.company_id = $2 AND c.agency_id = $3 AND t.is_active = true`,
      [templateId, companyId, agencyId],
    );
    if (!rows[0]) throw new HttpError(404, "Template not found");
    return { mapping: rows[0].column_mapping as ColumnMapping, templateId };
  }
  if (rawMapping) {
    return { mapping: mappingSchema.parse(rawMapping), templateId: null };
  }
  throw new HttpError(400, "Provide either template_id or column_mapping");
}

/**
 * Step 1 — upload the raw .xlsx. Returns the detected columns plus an
 * upload_key used by preview/commit (file is kept via the StorageProvider).
 */
router.post(
  "/upload",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Attach the Excel file as the 'file' field");
    if (!req.file.originalname.toLowerCase().endsWith(".xlsx")) {
      throw new HttpError(400, "Only .xlsx files are supported");
    }
    const sheet = await parseWorkbook(req.file.buffer);
    const key = await getStorage().save("imports", "xlsx", req.file.buffer);
    res.status(201).json({
      upload_key: key,
      file_name: req.file.originalname,
      columns: sheet.columns,
      row_count: sheet.rows.length,
      system_fields: SYSTEM_FIELDS,
    });
  }),
);

const previewSchema = z.object({
  upload_key: uploadKeySchema,
  company_id: z.string().uuid(),
  template_id: z.string().uuid().optional(),
  column_mapping: mappingSchema.optional(),
});

/** Step 2 — dry run: full validation report, nothing written. */
router.post(
  "/preview",
  asyncHandler(async (req, res) => {
    const body = previewSchema.parse(req.body);
    await assertCompanyInAgency(body.company_id, req.user!.agency_id);
    const { mapping } = await resolveMapping(
      req.user!.agency_id,
      body.company_id,
      body.template_id,
      body.column_mapping,
    );
    const sheet = await parseWorkbook(await getStorage().read(body.upload_key));
    const result = await validateRows(body.company_id, sheet, mapping);
    res.json({
      total_rows: sheet.rows.length,
      valid_rows: result.validRows.length - result.duplicatesInDb.length,
      error_rows: result.errors.length,
      duplicates_in_db: result.duplicatesInDb.length,
      unmapped_columns: result.unmappedColumns,
      errors: result.errors.slice(0, 50),
      duplicate_loan_numbers: result.duplicatesInDb.slice(0, 50),
      sample_rows: result.validRows.slice(0, 5),
    });
  }),
);

const commitSchema = previewSchema.extend({ file_name: z.string().max(300).optional() });

/** Step 3 — transactional commit into customers (+ product derivation + audit). */
router.post(
  "/commit",
  asyncHandler(async (req, res) => {
    const body = commitSchema.parse(req.body);
    await assertCompanyInAgency(body.company_id, req.user!.agency_id);
    const { mapping, templateId } = await resolveMapping(
      req.user!.agency_id,
      body.company_id,
      body.template_id,
      body.column_mapping,
    );
    const sheet = await parseWorkbook(await getStorage().read(body.upload_key));
    const result = await commitImport({
      companyId: body.company_id,
      templateId,
      uploadedBy: req.user!.id,
      fileName: body.file_name ?? null,
      sheet,
      mapping,
    });
    res.status(201).json(result);
  }),
);

/** Import history for a company. */
router.get(
  "/runs",
  asyncHandler(async (req, res) => {
    const companyId = z.string().uuid().parse(req.query.company_id);
    await assertCompanyInAgency(companyId, req.user!.agency_id);
    const { rows } = await pool.query(
      `SELECT r.*, u.full_name AS uploaded_by_name, t.name AS template_name
         FROM import_runs r
         LEFT JOIN users u ON u.id = r.uploaded_by
         LEFT JOIN import_templates t ON t.id = r.template_id
        WHERE r.company_id = $1
        ORDER BY r.created_at DESC
        LIMIT 100`,
      [companyId],
    );
    res.json({ runs: rows });
  }),
);

export default router;
