/**
 * Dev-only loader for sample payment data (Phase 5 dashboard testing).
 * Payments are normally recorded through the app; this exists so the user's
 * 3-month sample Excel files can exercise the dashboard.
 *
 * Usage: npm run seed:payments -- <file.xlsx> [company-name]
 *
 * Expected columns (header row): Loan Number, Amount, Paid At (YYYY-MM-DD or
 * datetime, IST), Mode, Collected By Phone, Deposited (Y/N optional).
 */
import ExcelJS from "exceljs";
import { pool } from "../config/db";

async function main() {
  const [file, companyName] = process.argv.slice(2);
  if (!file) {
    console.error("Usage: npm run seed:payments -- <file.xlsx> [company-name]");
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("Workbook has no worksheets");

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell) => {
    headers.push(String(cell.value ?? "").trim().toLowerCase());
  });
  const col = (row: ExcelJS.Row, ...names: string[]): string => {
    for (const name of names) {
      const idx = headers.indexOf(name);
      if (idx >= 0) {
        const v = row.getCell(idx + 1).value;
        if (v instanceof Date) return v.toISOString();
        if (v !== null && v !== undefined) return String(v).trim();
      }
    }
    return "";
  };

  let companyClause = "";
  const companyParams: string[] = [];
  if (companyName) {
    companyParams.push(companyName);
    companyClause = "AND lower(co.name) = lower($2)";
  }

  let inserted = 0;
  let skipped = 0;
  const problems: string[] = [];

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const loan = col(row, "loan number", "loan");
    if (!loan) continue;
    const amount = Number(col(row, "amount").replace(/[,\s₹]/g, ""));
    const paidAt = col(row, "paid at", "paid_at", "date");
    const mode = col(row, "mode") || null;
    const phone = col(row, "collected by phone", "collected by", "agent phone");
    const deposited = col(row, "deposited").toLowerCase().startsWith("y");

    if (!Number.isFinite(amount) || amount <= 0 || !paidAt || !phone) {
      problems.push(`Row ${r}: need loan, positive amount, paid at, collected by phone`);
      skipped++;
      continue;
    }

    const { rows: customers } = await pool.query(
      `SELECT c.id FROM customers c JOIN companies co ON co.id = c.company_id
        WHERE c.loan_number = $1 ${companyClause} LIMIT 1`,
      [loan, ...companyParams],
    );
    if (!customers[0]) {
      problems.push(`Row ${r}: loan "${loan}" not found — import the allocation file first`);
      skipped++;
      continue;
    }
    const { rows: users } = await pool.query("SELECT id FROM users WHERE phone = $1", [phone]);
    if (!users[0]) {
      problems.push(`Row ${r}: no user with phone "${phone}"`);
      skipped++;
      continue;
    }

    await pool.query(
      `INSERT INTO payments (customer_id, collected_by_user_id, amount, mode, paid_at,
                             deposited_at, deposited_by_user_id)
       VALUES ($1, $2, $3, $4,
               ($5::timestamp AT TIME ZONE 'Asia/Kolkata'),
               CASE WHEN $6 THEN now() END,
               CASE WHEN $6 THEN $2::uuid END)`,
      [customers[0].id, users[0].id, amount, mode, paidAt, deposited],
    );
    inserted++;
  }

  console.log(`Inserted ${inserted} payment(s), skipped ${skipped}.`);
  for (const p of problems.slice(0, 20)) console.log("  -", p);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
