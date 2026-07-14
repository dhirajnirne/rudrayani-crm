import { pool } from "../config/db";
import { commitImport, type ColumnMapping, type ParsedSheet } from "../services/import-service";
import * as XLSX from "xlsx";
import * as path from "path";
import { execSync } from "child_process";

// Helper to convert sheet to our ParsedSheet format
function parseExcelFile(filePath: string, columns: string[], limit: number = 200): ParsedSheet {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
  
  const selectedRows = jsonRows.slice(0, limit);
  const rows = selectedRows.map((row, i) => {
    const record: Record<string, string> = { __excelRow: String(i + 2) };
    columns.forEach(c => {
      record[c] = row[c] !== undefined && row[c] !== null ? String(row[c]) : "";
    });
    return record;
  });
  
  return { columns, rows };
}

const FILES = [
  {
    name: "Indifi",
    path: "c:/Rudrayani_Fintech_2/resource files/Indifi allocation July.xlsx",
    mapping: {
      "App Id": "loan_number",
      "Promoter Name": "customer_name",
      "Updated Bucket": "bucket",
      "POS": "due_amount",
      "POS Band": "emi", // fallback
      "Agency FOS Name": "agent_phone",
      "Agency FOS  Contact no": "mobile_number",
      "Alloc Type": "product",
      "POS In Lakh": "pos"
    },
    columns: ["App Id", "Promoter Name", "Updated Bucket", "POS", "POS Band", "Agency FOS Name", "Agency FOS  Contact no", "Alloc Type", "POS In Lakh"]
  },
  {
    name: "Hero Fincorp",
    path: "c:/Rudrayani_Fintech_2/resource files/Hero Fincorp allocations july.xlsx",
    mapping: {
      "loan_agreement_no": "loan_number",
      "customername": "customer_name",
      "Bkt": "bucket",
      "pos": "due_amount",
      "emi_amount": "emi",
      "FOS Name": "agent_phone",
      "customer_add_mobile": "mobile_number",
      "product": "product",
      "POS (In Cr)": "pos"
    },
    columns: ["loan_agreement_no", "customername", "Bkt", "pos", "emi_amount", "FOS Name", "customer_add_mobile", "product", "POS (In Cr)"]
  },
  {
    name: "Five Star",
    path: "c:/Rudrayani_Fintech_2/resource files/five star allocation July.xlsx",
    mapping: {
      "loan_agreement_no": "loan_number",
      "customername": "customer_name",
      "Bkt": "bucket",
      "pos": "due_amount",
      "emi_amount": "emi",
      "employee_id": "agent_phone",
      "customer_add_mobile": "mobile_number",
      "product": "product",
      "POS In CR": "pos"
    },
    columns: ["loan_agreement_no", "customername", "Bkt", "pos", "emi_amount", "employee_id", "customer_add_mobile", "product", "POS In CR"]
  }
];

async function run(): Promise<void> {
  const { rows: agencies } = await pool.query(
    "SELECT id, name FROM agencies ORDER BY created_at LIMIT 1"
  );
  if (!agencies[0]) {
    console.error("No agency found — run seed:admin first.");
    process.exit(1);
  }
  const agencyId = agencies[0].id as string;
  
  const { rows: admins } = await pool.query(
    "SELECT id FROM users WHERE agency_id = $1 AND is_agency_admin = true LIMIT 1",
    [agencyId]
  );
  const adminId = admins[0]?.id ?? null;
  if (!adminId) {
    console.error("No agency admin found — run seed:admin first.");
    process.exit(1);
  }

  for (const fileConf of FILES) {
    console.log(`\nProcessing ${fileConf.name}...`);
    
    // Create company if not exists
    const { rows: existingCompanies } = await pool.query(
      "SELECT id FROM companies WHERE agency_id = $1 AND name = $2 ORDER BY created_at LIMIT 1",
      [agencyId, fileConf.name]
    );
    let companyId: string;
    if (existingCompanies[0]) {
      companyId = existingCompanies[0].id;
    } else {
      const { rows } = await pool.query(
        "INSERT INTO companies (agency_id, name) VALUES ($1, $2) RETURNING id",
        [agencyId, fileConf.name]
      );
      companyId = rows[0].id;
    }

    const parsedSheet = parseExcelFile(fileConf.path, fileConf.columns, 200);
    
    // Simulate past (June) and present (July) allocations
    // June: rows 0 to 150
    // July: rows 50 to 200
    const juneRows = parsedSheet.rows.slice(0, 150);
    const julyRows = parsedSheet.rows.slice(50, 200);

    const juneSheet: ParsedSheet = { columns: parsedSheet.columns, rows: juneRows };
    const julySheet: ParsedSheet = { columns: parsedSheet.columns, rows: julyRows };

    console.log(`  Seeding June allocation (150 records)...`);
    await commitImport({
      companyId,
      templateId: null,
      uploadedBy: adminId,
      fileName: path.basename(fileConf.path),
      sheet: juneSheet,
      mapping: fileConf.mapping as unknown as ColumnMapping,
      mode: "allocation",
      allocationMonth: "2026-06-01",
    });

    console.log(`  Seeding July allocation (150 records)...`);
    await commitImport({
      companyId,
      templateId: null,
      uploadedBy: adminId,
      fileName: path.basename(fileConf.path),
      sheet: julySheet,
      mapping: fileConf.mapping as unknown as ColumnMapping,
      mode: "allocation",
      allocationMonth: "2026-07-01",
    });

    // Run activity generation using the existing seed_hero_activity script
    // We pass the company name and an optional perBucket count.
    console.log(`  Generating activity for ${fileConf.name}...`);
    try {
      execSync(`npx tsx src/migrations/seed_hero_activity.ts "${fileConf.name}" 10`, { stdio: 'inherit' });
    } catch (err) {
      console.error(`  Error running activity generator for ${fileConf.name}:`, err);
    }
  }

  console.log(`\nFinished importing all Excel data.`);
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
