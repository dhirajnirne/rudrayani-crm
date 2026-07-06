import ExcelJS from "exceljs";
import type { PoolClient } from "pg";
import { pool } from "../config/db";
import { HttpError } from "../middleware/error-handler";

/** System fields an Excel column can map to (brief Section 4). */
export const SYSTEM_FIELDS = [
  "loan_number",
  "customer_name",
  "mobile_number",
  "product",
  "bucket",
  "due_amount",
  "emi",
  "agent_phone", // assigns the loan to the agent with this phone (optional)
] as const;
export type SystemField = (typeof SYSTEM_FIELDS)[number];
const REQUIRED_FIELDS: SystemField[] = ["loan_number", "customer_name"];
const NUMERIC_FIELDS: SystemField[] = ["due_amount", "emi"];

/** {"Excel Column Header": "system_field"} — unmapped headers go to custom_fields. */
export type ColumnMapping = Record<string, SystemField>;

export interface ParsedSheet {
  columns: string[];
  rows: Record<string, string>[]; // keyed by header, all values as trimmed strings
}

export interface RowProblem {
  row: number; // 1-based Excel row number (header = row 1)
  problems: string[];
}

export interface MappedRow {
  excelRow: number;
  loan_number: string;
  customer_name: string;
  mobile_number: string | null;
  product: string | null;
  bucket: string | null;
  due_amount: number | null;
  emi: number | null;
  agent_phone: string | null;
  custom_fields: Record<string, string>;
}

export type ImportMode = "new" | "allocation";

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    // Formula results, rich text, hyperlinks
    const v = value as { result?: ExcelJS.CellValue; text?: string; richText?: { text: string }[] };
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return cellToString(v.result);
    return "";
  }
  return String(value).trim();
}

export async function parseWorkbook(buffer: Buffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new HttpError(400, "Could not read the file — is it a valid .xlsx workbook?");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new HttpError(400, "The workbook has no worksheets");

  const headerRow = sheet.getRow(1);
  const columns: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    const name = cellToString(cell.value);
    if (name) columns.push(name);
  });
  if (columns.length === 0) throw new HttpError(400, "The first row must contain column headers");

  const rows: Record<string, string>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    let hasValue = false;
    columns.forEach((col, idx) => {
      const value = cellToString(row.getCell(idx + 1).value);
      record[col] = value;
      if (value) hasValue = true;
    });
    if (hasValue) {
      record.__excelRow = String(rowNumber);
      rows.push(record);
    }
  });
  return { columns, rows };
}

function parseAmount(raw: string): number | null | "invalid" {
  if (!raw) return null;
  const cleaned = raw.replace(/[,\s₹]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return "invalid";
  return Number(cleaned);
}

export interface ValidationResult {
  validRows: MappedRow[];
  errors: RowProblem[];
  duplicatesInFile: string[];
  duplicatesInDb: string[];
  unmappedColumns: string[];
}

export async function validateRows(
  companyId: string,
  sheet: ParsedSheet,
  mapping: ColumnMapping,
): Promise<ValidationResult> {
  const mappedFields = Object.values(mapping);
  for (const required of REQUIRED_FIELDS) {
    if (!mappedFields.includes(required)) {
      throw new HttpError(400, `The template must map a column to "${required}"`);
    }
  }
  for (const [column, field] of Object.entries(mapping)) {
    if (!SYSTEM_FIELDS.includes(field)) {
      throw new HttpError(400, `Unknown system field "${field}" for column "${column}"`);
    }
    if (!sheet.columns.includes(column)) {
      throw new HttpError(400, `Mapped column "${column}" was not found in the file`);
    }
  }

  const unmappedColumns = sheet.columns.filter((c) => !(c in mapping));
  const seenLoanNumbers = new Map<string, number>();
  const validRows: MappedRow[] = [];
  const errors: RowProblem[] = [];
  const duplicatesInFile = new Set<string>();

  for (const record of sheet.rows) {
    const excelRow = Number(record.__excelRow);
    const problems: string[] = [];
    const mapped: Partial<MappedRow> & { custom_fields: Record<string, string> } = {
      excelRow,
      custom_fields: {},
    };

    for (const [column, field] of Object.entries(mapping)) {
      const raw = record[column] ?? "";
      if (NUMERIC_FIELDS.includes(field)) {
        const amount = parseAmount(raw);
        if (amount === "invalid") {
          problems.push(`"${column}" has a non-numeric value: "${raw}"`);
        } else {
          mapped[field] = amount as never;
        }
      } else {
        mapped[field] = (raw || null) as never;
      }
    }
    for (const column of unmappedColumns) {
      if (record[column]) mapped.custom_fields[column] = record[column];
    }

    for (const required of REQUIRED_FIELDS) {
      if (!mapped[required]) problems.push(`Missing required field "${required}"`);
    }

    const loanNumber = mapped.loan_number;
    if (loanNumber) {
      const firstRow = seenLoanNumbers.get(loanNumber);
      if (firstRow !== undefined) {
        problems.push(`Duplicate loan number "${loanNumber}" (first seen at row ${firstRow})`);
        duplicatesInFile.add(loanNumber);
      } else {
        seenLoanNumbers.set(loanNumber, excelRow);
      }
    }

    if (problems.length > 0) {
      errors.push({ row: excelRow, problems });
    } else {
      validRows.push(mapped as MappedRow);
    }
  }

  // Which of the file's loan numbers already exist for this company?
  const loanNumbers = validRows.map((r) => r.loan_number);
  let duplicatesInDb: string[] = [];
  if (loanNumbers.length > 0) {
    const { rows } = await pool.query(
      "SELECT loan_number FROM customers WHERE company_id = $1 AND loan_number = ANY($2)",
      [companyId, loanNumbers],
    );
    duplicatesInDb = rows.map((r) => r.loan_number as string);
  }

  return {
    validRows,
    errors,
    duplicatesInFile: [...duplicatesInFile],
    duplicatesInDb,
    unmappedColumns,
  };
}

async function deriveProducts(
  client: PoolClient,
  companyId: string,
  rows: MappedRow[],
): Promise<void> {
  const labels = [...new Set(rows.map((r) => r.product).filter((p): p is string => !!p))];
  for (const label of labels) {
    // canonical starts equal to raw; normalization is a later admin action (brief §4)
    await client.query(
      `INSERT INTO products (company_id, raw_label, canonical_label)
       VALUES ($1, $2, $2) ON CONFLICT (company_id, raw_label) DO NOTHING`,
      [companyId, label],
    );
  }
}

/**
 * Bucket labels auto-register in the buckets master (Phase 5): new labels
 * append at the end of the order with default category; the admin fixes
 * ordering/flags on the Buckets page. Imports never block on bucket config.
 */
async function deriveBuckets(
  client: PoolClient,
  companyId: string,
  rows: MappedRow[],
): Promise<void> {
  const labels = [...new Set(rows.map((r) => r.bucket).filter((b): b is string => !!b))];
  for (const label of labels) {
    await client.query(
      `INSERT INTO buckets (company_id, label, sort_order)
       VALUES ($1, $2,
               COALESCE((SELECT MAX(sort_order) + 1 FROM buckets WHERE company_id = $1), 0))
       ON CONFLICT (company_id, label) DO NOTHING`,
      [companyId, label],
    );
  }
}

export interface CommitResult {
  import_run_id: string;
  total_rows: number;
  inserted_rows: number;
  updated_rows: number;
  duplicate_rows: number;
  error_rows: number;
  unknown_agent_phones: string[];
}

/** phone -> {id, team_id} for the agency's active users named in the file. */
async function resolveAgents(
  client: PoolClient,
  companyId: string,
  rows: MappedRow[],
): Promise<Map<string, { id: string; team_id: string | null }>> {
  const phones = [...new Set(rows.map((r) => r.agent_phone).filter((p): p is string => !!p))];
  const resolved = new Map<string, { id: string; team_id: string | null }>();
  if (phones.length === 0) return resolved;
  const { rows: users } = await client.query(
    `SELECT u.id, u.team_id, u.phone FROM users u
       JOIN companies co ON co.agency_id = u.agency_id
      WHERE co.id = $1 AND u.phone = ANY($2) AND u.is_active = true`,
    [companyId, phones],
  );
  for (const u of users) resolved.set(u.phone as string, { id: u.id, team_id: u.team_id });
  return resolved;
}

export async function commitImport(params: {
  companyId: string;
  templateId: string | null;
  uploadedBy: string;
  fileName: string | null;
  sheet: ParsedSheet;
  mapping: ColumnMapping;
  mode?: ImportMode;
  allocationMonth?: string | null; // 'YYYY-MM-01', required in allocation mode
}): Promise<CommitResult> {
  const mode: ImportMode = params.mode ?? "new";
  if (mode === "allocation" && !params.allocationMonth) {
    throw new HttpError(400, "allocation_month is required for a monthly allocation import");
  }
  const validation = await validateRows(params.companyId, params.sheet, params.mapping);
  const dbDupes = new Set(validation.duplicatesInDb);
  const toInsert = validation.validRows.filter((r) => !dbDupes.has(r.loan_number));
  // In allocation mode existing loans are the point of the file: update them.
  const toUpdate = mode === "allocation" ? validation.validRows.filter((r) => dbDupes.has(r.loan_number)) : [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Run row first so snapshots can reference it; counts patched at the end.
    const run = await client.query(
      `INSERT INTO import_runs
         (company_id, template_id, uploaded_by, file_name, total_rows,
          inserted_rows, duplicate_rows, error_rows, errors, mode, allocation_month)
       VALUES ($1,$2,$3,$4,$5,0,0,0,'[]',$6,$7)
       RETURNING id`,
      [
        params.companyId,
        params.templateId,
        params.uploadedBy,
        params.fileName,
        params.sheet.rows.length,
        mode,
        params.allocationMonth ?? null,
      ],
    );
    const runId = run.rows[0].id as string;

    const agents = await resolveAgents(client, params.companyId, [...toInsert, ...toUpdate]);
    const unknownPhones = new Set<string>();
    const snapshotIds: string[] = [];

    for (const row of toInsert) {
      const agent = row.agent_phone ? agents.get(row.agent_phone) : undefined;
      if (row.agent_phone && !agent) unknownPhones.add(row.agent_phone);
      const inserted = await client.query(
        `INSERT INTO customers
           (company_id, loan_number, customer_name, mobile_number, product, bucket,
            due_amount, emi, custom_fields, assigned_agent_id, assigned_team_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (company_id, loan_number) DO NOTHING
         RETURNING id`,
        [
          params.companyId,
          row.loan_number,
          row.customer_name,
          row.mobile_number,
          row.product,
          row.bucket,
          row.due_amount,
          row.emi,
          JSON.stringify(row.custom_fields),
          agent?.id ?? null,
          agent?.team_id ?? null,
        ],
      );
      if (inserted.rows[0]) {
        snapshotIds.push(inserted.rows[0].id as string);
        if (agent) {
          await client.query(
            `INSERT INTO allocation_logs (customer_id, from_agent_id, to_agent_id, allocated_by, reason)
             VALUES ($1, NULL, $2, $3, 'Assigned by import')`,
            [inserted.rows[0].id, agent.id, params.uploadedBy],
          );
        }
      }
    }

    for (const row of toUpdate) {
      const agent = row.agent_phone ? agents.get(row.agent_phone) : undefined;
      if (row.agent_phone && !agent) unknownPhones.add(row.agent_phone);
      const existing = await client.query(
        `SELECT id, assigned_agent_id FROM customers
          WHERE company_id = $1 AND loan_number = $2 FOR UPDATE`,
        [params.companyId, row.loan_number],
      );
      const cust = existing.rows[0];
      if (!cust) continue; // deleted between validate and commit — skip quietly
      // The month's file is authoritative for bucket/amounts; blanks keep old values.
      await client.query(
        `UPDATE customers
            SET customer_name   = COALESCE($2, customer_name),
                mobile_number   = COALESCE($3, mobile_number),
                product         = COALESCE($4, product),
                bucket          = COALESCE($5, bucket),
                due_amount      = COALESCE($6, due_amount),
                emi             = COALESCE($7, emi),
                custom_fields   = custom_fields || $8::jsonb,
                assigned_agent_id = COALESCE($9, assigned_agent_id),
                assigned_team_id  = COALESCE($10, assigned_team_id)
          WHERE id = $1`,
        [
          cust.id,
          row.customer_name,
          row.mobile_number,
          row.product,
          row.bucket,
          row.due_amount,
          row.emi,
          JSON.stringify(row.custom_fields),
          agent?.id ?? null,
          agent?.team_id ?? null,
        ],
      );
      snapshotIds.push(cust.id as string);
      if (agent && cust.assigned_agent_id !== agent.id) {
        await client.query(
          `INSERT INTO allocation_logs (customer_id, from_agent_id, to_agent_id, allocated_by, reason)
           VALUES ($1, $2, $3, $4, 'Monthly allocation import')`,
          [cust.id, cust.assigned_agent_id, agent.id, params.uploadedBy],
        );
      }
    }

    // Snapshot every loan in the file — this is the month's allocated book.
    if (mode === "allocation") {
      for (const customerId of snapshotIds) {
        await client.query(
          `INSERT INTO customer_month_snapshots
             (customer_id, company_id, month, bucket, due_amount, emi, product,
              assigned_team_id, assigned_agent_id, import_run_id)
           SELECT c.id, c.company_id, $2, c.bucket, c.due_amount, c.emi, c.product,
                  c.assigned_team_id, c.assigned_agent_id, $3
             FROM customers c WHERE c.id = $1
           ON CONFLICT (customer_id, month) DO UPDATE
             SET bucket = EXCLUDED.bucket,
                 due_amount = EXCLUDED.due_amount,
                 emi = EXCLUDED.emi,
                 product = EXCLUDED.product,
                 assigned_team_id = EXCLUDED.assigned_team_id,
                 assigned_agent_id = EXCLUDED.assigned_agent_id,
                 import_run_id = EXCLUDED.import_run_id`,
          [customerId, params.allocationMonth, runId],
        );
      }
    }

    const affected = [...toInsert, ...toUpdate];
    await deriveProducts(client, params.companyId, affected);
    await deriveBuckets(client, params.companyId, affected);

    const duplicateRows = mode === "new" ? validation.duplicatesInDb.length : 0;
    await client.query(
      `UPDATE import_runs
          SET inserted_rows = $2, updated_rows = $3, duplicate_rows = $4,
              error_rows = $5, errors = $6
        WHERE id = $1`,
      [
        runId,
        toInsert.length,
        toUpdate.length,
        duplicateRows,
        validation.errors.length,
        JSON.stringify(validation.errors.slice(0, 100)),
      ],
    );
    await client.query("COMMIT");
    return {
      import_run_id: runId,
      total_rows: params.sheet.rows.length,
      inserted_rows: toInsert.length,
      updated_rows: toUpdate.length,
      duplicate_rows: duplicateRows,
      error_rows: validation.errors.length,
      unknown_agent_phones: [...unknownPhones],
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Active loans of the company that a given file does not mention (allocation preview stat). */
export async function countMissingFromFile(
  companyId: string,
  rows: MappedRow[],
): Promise<number> {
  const loanNumbers = rows.map((r) => r.loan_number);
  const { rows: result } = await pool.query(
    `SELECT COUNT(*)::int AS missing FROM customers
      WHERE company_id = $1 AND status = 'active'
        AND NOT (loan_number = ANY($2))`,
    [companyId, loanNumbers],
  );
  return result[0].missing as number;
}
