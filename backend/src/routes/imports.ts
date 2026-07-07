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
  computeAllocationDiff,
  isMidMonthImport,
  parseWorkbook,
  previewNewLabels,
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

const previewSchema = z
  .object({
    upload_key: uploadKeySchema,
    company_id: z.string().uuid(),
    template_id: z.string().uuid().optional(),
    column_mapping: mappingSchema.optional(),
    mode: z.enum(["new", "allocation"]).default("new"),
    allocation_month: z
      .string()
      .regex(/^\d{4}-\d{2}-01$/, "allocation_month must be the 1st of a month (YYYY-MM-01)")
      .optional(),
  })
  .refine((b) => b.mode !== "allocation" || !!b.allocation_month, {
    message: "allocation_month is required for a monthly allocation import",
    path: ["allocation_month"],
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

    if (body.mode !== "allocation") {
      res.json({
        mode: body.mode,
        total_rows: sheet.rows.length,
        valid_rows: result.validRows.length - result.duplicatesInDb.length,
        error_rows: result.errors.length,
        duplicates_in_db: result.duplicatesInDb.length,
        unmapped_columns: result.unmappedColumns,
        errors: result.errors.slice(0, 50),
        duplicate_loan_numbers: result.duplicatesInDb.slice(0, 50),
        sample_rows: result.validRows.slice(0, 5),
      });
      return;
    }

    // Allocation mode: show the actual diff against the active book, not just
    // a dupes/missing count, so the reviewer knows what will need a decision.
    const isMidMonth = await isMidMonthImport(body.company_id, body.allocation_month!);
    const diff = await computeAllocationDiff(body.company_id, result.validRows);
    const labels = await previewNewLabels(body.company_id, result.validRows);

    const removalCustomerIds = diff.removals.map((r) => r.customerId);
    const removalDetails = removalCustomerIds.length
      ? await pool.query(
          `SELECT c.id, c.customer_name, c.bucket, c.due_amount, u.full_name AS agent_name
             FROM customers c LEFT JOIN users u ON u.id = c.assigned_agent_id
            WHERE c.id = ANY($1)`,
          [removalCustomerIds],
        )
      : { rows: [] as { id: string; customer_name: string; bucket: string | null; due_amount: string | null; agent_name: string | null }[] };
    const removalById = new Map(removalDetails.rows.map((r) => [r.id, r]));

    res.json({
      mode: "allocation",
      total_rows: sheet.rows.length,
      error_rows: result.errors.length,
      is_mid_month: isMidMonth,
      will_update: diff.updates.length,
      additions: {
        count: diff.additions.length,
        sample: diff.additions.slice(0, 20).map((a) => ({
          loan_number: a.loan_number,
          customer_name: a.row.customer_name,
          bucket: a.row.bucket,
          due_amount: a.row.due_amount,
        })),
      },
      removals: {
        count: diff.removals.length,
        sample: diff.removals.slice(0, 20).map((r) => ({
          loan_number: r.loanNumber,
          customer_name: removalById.get(r.customerId)?.customer_name ?? null,
          bucket: removalById.get(r.customerId)?.bucket ?? null,
          due_amount: removalById.get(r.customerId)?.due_amount ?? null,
          agent_name: removalById.get(r.customerId)?.agent_name ?? null,
        })),
      },
      reactivations: {
        count: diff.reactivations.length,
        sample: diff.reactivations.slice(0, 20).map((r) => ({
          loan_number: r.row.loan_number,
          customer_name: r.row.customer_name,
          previous_status: r.previousStatus,
        })),
      },
      new_buckets: labels.new_buckets,
      new_products: labels.new_products,
      unmapped_columns: result.unmappedColumns,
      errors: result.errors.slice(0, 50),
      sample_rows: result.validRows.slice(0, 5),
    });
  }),
);

const commitSchema = z
  .object({
    upload_key: uploadKeySchema,
    company_id: z.string().uuid(),
    template_id: z.string().uuid().optional(),
    column_mapping: mappingSchema.optional(),
    mode: z.enum(["new", "allocation"]).default("new"),
    allocation_month: z
      .string()
      .regex(/^\d{4}-\d{2}-01$/, "allocation_month must be the 1st of a month (YYYY-MM-01)")
      .optional(),
    file_name: z.string().max(300).optional(),
  })
  .refine((b) => b.mode !== "allocation" || !!b.allocation_month, {
    message: "allocation_month is required for a monthly allocation import",
    path: ["allocation_month"],
  });

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
      mode: body.mode,
      allocationMonth: body.allocation_month ?? null,
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
