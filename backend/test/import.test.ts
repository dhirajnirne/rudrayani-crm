import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/config/db";
import { hashPassword } from "../src/services/auth-service";

// Integration tests: require the Postgres container running with migrations applied.
const app = createApp();

const PASSWORD = "Secret@123";
const ADMIN_PHONE = "7200000001";

let agencyId: string;
let companyId: string;
let token: string;
let uploadKey: string;
let templateId: string;

/** A realistic messy company sheet: 4 valid rows (2 product spellings),
 *  1 missing loan number, 1 in-file duplicate, 1 bad amount, 1 custom column. */
async function buildTestSheet(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ledger");
  ws.addRow(["Loan No", "Cust Name", "Mobile", "Prod", "BKT", "Total Due", "EMI Amt", "Vehicle No"]);
  ws.addRow(["LN001", "Ramesh Kumar", "9800000001", "HL", "B1", "1,25,000", 5200, "MH10AB1234"]);
  ws.addRow(["LN002", "Suresh Patil", "9800000002", "Home Loan", "B2", 78000, 3100, ""]);
  ws.addRow(["LN003", "Ganesh Jadhav", "9800000003", "PL", "B1", 56000, 2500, "MH09XY7777"]);
  ws.addRow(["LN004", "Mahesh Pawar", "9800000004", "PL", "B3", 91000, 4100, ""]);
  ws.addRow(["", "No LoanNumber", "9800000005", "PL", "B1", 10000, 500, ""]); // missing required
  ws.addRow(["LN001", "Dup LoanNumber", "9800000006", "HL", "B1", 20000, 900, ""]); // in-file dup
  ws.addRow(["LN005", "Bad Amount", "9800000007", "HL", "B2", "not-a-number", 700, ""]); // malformed
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const MAPPING = {
  "Loan No": "loan_number",
  "Cust Name": "customer_name",
  Mobile: "mobile_number",
  Prod: "product",
  BKT: "bucket",
  "Total Due": "due_amount",
  "EMI Amt": "emi",
  // "Vehicle No" deliberately unmapped -> custom_fields
};

beforeAll(async () => {
  const agency = await pool.query(
    "INSERT INTO agencies (name) VALUES ('Test Agency (import.test)') RETURNING id",
  );
  agencyId = agency.rows[0].id;
  const hash = await hashPassword(PASSWORD);
  await pool.query(
    `INSERT INTO users (agency_id, full_name, phone, password_hash, is_agency_admin)
     VALUES ($1, 'Import Admin', $2, $3, true)`,
    [agencyId, ADMIN_PHONE, hash],
  );
  const company = await pool.query(
    "INSERT INTO companies (agency_id, name) VALUES ($1, 'Test FinCorp') RETURNING id",
  [agencyId]);
  companyId = company.rows[0].id;

  const login = await request(app)
    .post("/api/auth/login")
    .send({ phone: ADMIN_PHONE, password: PASSWORD });
  token = login.body.access_token;
});

afterAll(async () => {
  await pool.query("DELETE FROM import_runs WHERE company_id = $1", [companyId]);
  await pool.query("DELETE FROM products WHERE company_id = $1", [companyId]);
  await pool.query("DELETE FROM customers WHERE company_id = $1", [companyId]);
  await pool.query("DELETE FROM import_templates WHERE company_id = $1", [companyId]);
  await pool.query("DELETE FROM companies WHERE id = $1", [companyId]);
  await pool.query("DELETE FROM users WHERE agency_id = $1", [agencyId]);
  await pool.query("DELETE FROM agencies WHERE id = $1", [agencyId]);
  await pool.end();
});

describe("Excel import pipeline (brief §4)", () => {
  it("upload detects the columns", async () => {
    const res = await request(app)
      .post("/api/imports/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", await buildTestSheet(), "hero_ledger.xlsx");
    expect(res.status).toBe(201);
    expect(res.body.columns).toEqual([
      "Loan No",
      "Cust Name",
      "Mobile",
      "Prod",
      "BKT",
      "Total Due",
      "EMI Amt",
      "Vehicle No",
    ]);
    expect(res.body.row_count).toBe(7);
    uploadKey = res.body.upload_key;
  });

  it("saves the mapping as a reusable template", async () => {
    const res = await request(app)
      .post("/api/import-templates")
      .set("Authorization", `Bearer ${token}`)
      .send({ company_id: companyId, name: "Standard Ledger", column_mapping: MAPPING });
    expect(res.status).toBe(201);
    expect(res.body.template.version).toBe(1);
    templateId = res.body.template.id;
  });

  it("re-saving the same template name creates version 2 and deactivates v1", async () => {
    const res = await request(app)
      .post("/api/import-templates")
      .set("Authorization", `Bearer ${token}`)
      .send({ company_id: companyId, name: "Standard Ledger", column_mapping: MAPPING });
    expect(res.status).toBe(201);
    expect(res.body.template.version).toBe(2);
    templateId = res.body.template.id;

    const list = await request(app)
      .get(`/api/import-templates?company_id=${companyId}`)
      .set("Authorization", `Bearer ${token}`);
    const versions = list.body.templates.filter(
      (t: { name: string }) => t.name === "Standard Ledger",
    );
    expect(versions).toHaveLength(2);
    expect(versions.find((t: { version: number }) => t.version === 1).is_active).toBe(false);
  });

  it("preview reports errors, dupes, and unmapped columns without writing", async () => {
    const res = await request(app)
      .post("/api/imports/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({ upload_key: uploadKey, company_id: companyId, template_id: templateId });
    expect(res.status).toBe(200);
    expect(res.body.total_rows).toBe(7);
    expect(res.body.valid_rows).toBe(4);
    expect(res.body.error_rows).toBe(3); // missing loan no, in-file dup, bad amount
    expect(res.body.duplicates_in_db).toBe(0);
    expect(res.body.unmapped_columns).toEqual(["Vehicle No"]);

    const allProblems = res.body.errors.flatMap((e: { problems: string[] }) => e.problems).join(" | ");
    expect(allProblems).toContain('Missing required field "loan_number"');
    expect(allProblems).toContain('Duplicate loan number "LN001"');
    expect(allProblems).toContain("non-numeric");

    const count = await pool.query("SELECT COUNT(*)::int AS n FROM customers WHERE company_id = $1", [
      companyId,
    ]);
    expect(count.rows[0].n).toBe(0); // preview writes nothing
  });

  it("commit inserts the valid rows with custom_fields preserved", async () => {
    const res = await request(app)
      .post("/api/imports/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({
        upload_key: uploadKey,
        company_id: companyId,
        template_id: templateId,
        file_name: "hero_ledger.xlsx",
      });
    expect(res.status).toBe(201);
    expect(res.body.inserted_rows).toBe(4);
    expect(res.body.error_rows).toBe(3);

    const { rows } = await pool.query(
      "SELECT * FROM customers WHERE company_id = $1 AND loan_number = 'LN001'",
      [companyId],
    );
    expect(rows[0].customer_name).toBe("Ramesh Kumar");
    expect(Number(rows[0].due_amount)).toBe(125000); // "1,25,000" parsed
    expect(rows[0].custom_fields["Vehicle No"]).toBe("MH10AB1234"); // nothing lost
  });

  it("re-importing the same file flags all rows as DB duplicates, inserts none", async () => {
    const preview = await request(app)
      .post("/api/imports/preview")
      .set("Authorization", `Bearer ${token}`)
      .send({ upload_key: uploadKey, company_id: companyId, template_id: templateId });
    expect(preview.body.duplicates_in_db).toBe(4);
    expect(preview.body.valid_rows).toBe(0);

    const commit = await request(app)
      .post("/api/imports/commit")
      .set("Authorization", `Bearer ${token}`)
      .send({ upload_key: uploadKey, company_id: companyId, template_id: templateId });
    expect(commit.body.inserted_rows).toBe(0);
    expect(commit.body.duplicate_rows).toBe(4);
  });

  it("records the import history", async () => {
    const res = await request(app)
      .get(`/api/imports/runs?company_id=${companyId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.runs).toHaveLength(2);
    expect(res.body.runs.map((r: { inserted_rows: number }) => r.inserted_rows).sort()).toEqual([
      0, 4,
    ]);
  });
});

describe("Products & buckets derivation (brief §4)", () => {
  it("products were derived from the imported data", async () => {
    const res = await request(app)
      .get(`/api/products?company_id=${companyId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    const labels = res.body.products.map((p: { raw_label: string }) => p.raw_label).sort();
    expect(labels).toEqual(["HL", "Home Loan", "PL"]);
  });

  it("normalizes HL + Home Loan into one canonical product without re-import", async () => {
    const res = await request(app)
      .post("/api/products/normalize")
      .set("Authorization", `Bearer ${token}`)
      .send({
        company_id: companyId,
        raw_labels: ["HL", "Home Loan"],
        canonical_label: "Home Loan",
      });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);

    const list = await request(app)
      .get(`/api/products?company_id=${companyId}`)
      .set("Authorization", `Bearer ${token}`);
    const canonicals = new Set(
      list.body.products.map((p: { canonical_label: string }) => p.canonical_label),
    );
    expect(canonicals).toEqual(new Set(["Home Loan", "PL"]));
  });

  it("imported bucket labels auto-register in the buckets master", async () => {
    const res = await request(app)
      .get(`/api/buckets?company_id=${companyId}`)
      .set("Authorization", `Bearer ${token}`);
    const labels = res.body.buckets.map((b: { label: string }) => b.label);
    expect(new Set(labels)).toEqual(new Set(["B1", "B2", "B3"]));
    // Fresh labels come in with safe defaults the admin can then adjust.
    for (const b of res.body.buckets) {
      expect(b.category).toBe("normal");
      expect(b.is_current).toBe(false);
    }
  });

  it("an agent (customers.view only) cannot run imports", async () => {
    await pool.query(
      `INSERT INTO users (agency_id, full_name, phone, password_hash, is_field_agent)
       VALUES ($1, 'No Import Rights', '7200000002', $2, true)`,
      [agencyId, await hashPassword(PASSWORD)],
    );
    const login = await request(app)
      .post("/api/auth/login")
      .send({ phone: "7200000002", password: PASSWORD });
    const res = await request(app)
      .post("/api/imports/preview")
      .set("Authorization", `Bearer ${login.body.access_token}`)
      .send({ upload_key: uploadKey, company_id: companyId, template_id: templateId });
    expect(res.status).toBe(403);
  });
});
