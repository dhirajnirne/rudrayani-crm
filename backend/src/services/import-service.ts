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
  custom_fields: Record<string, string>;
}

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
  duplicate_rows: number;
  error_rows: number;
}

export async function commitImport(params: {
  companyId: string;
  templateId: string | null;
  uploadedBy: string;
  fileName: string | null;
  sheet: ParsedSheet;
  mapping: ColumnMapping;
}): Promise<CommitResult> {
  const validation = await validateRows(params.companyId, params.sheet, params.mapping);
  const dbDupes = new Set(validation.duplicatesInDb);
  const toInsert = validation.validRows.filter((r) => !dbDupes.has(r.loan_number));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of toInsert) {
      await client.query(
        `INSERT INTO customers
           (company_id, loan_number, customer_name, mobile_number, product, bucket,
            due_amount, emi, custom_fields)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (company_id, loan_number) DO NOTHING`,
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
        ],
      );
    }
    await deriveProducts(client, params.companyId, toInsert);
    await deriveBuckets(client, params.companyId, toInsert);
    const run = await client.query(
      `INSERT INTO import_runs
         (company_id, template_id, uploaded_by, file_name, total_rows,
          inserted_rows, duplicate_rows, error_rows, errors)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        params.companyId,
        params.templateId,
        params.uploadedBy,
        params.fileName,
        params.sheet.rows.length,
        toInsert.length,
        validation.duplicatesInDb.length,
        validation.errors.length,
        JSON.stringify(validation.errors.slice(0, 100)),
      ],
    );
    await client.query("COMMIT");
    return {
      import_run_id: run.rows[0].id,
      total_rows: params.sheet.rows.length,
      inserted_rows: toInsert.length,
      duplicate_rows: validation.duplicatesInDb.length,
      error_rows: validation.errors.length,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
