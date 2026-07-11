/**
 * Shared builder for the multi-company, multi-month test scenario (Phase 7
 * correction: "create realistic test files for past months, different
 * companies, and test all the scenarios"). Single source of truth used by
 * both `generate.ts` (writes committed .xlsx files for manual QA/demo) and
 * `backend/test/e2e-allocation-lifecycle.test.ts` (drives the same scenario
 * through the real HTTP API and asserts outcomes) -- so the demo files and
 * the automated test can never silently drift apart.
 *
 * Two companies, deliberately different column layouts (mirroring how real
 * lenders never agree on a schema):
 *  - "Alpha Finance NBFC" (Hero-FinCorp-style): loan_agreement_no,
 *    customername, Bkt, PROD, pos, emi_amount, [due_date from month 3]
 *  - "Beta Credit Corp" (Indifi-style): App Id, Promoter Name,
 *    Updated Bucket, POS, EMI, [Next EMI Date from month 3]
 *
 * Three months each (the three months immediately preceding "today", so the
 * generated files always read as real past allocation history whenever this
 * runs): month 1 (first-of-month, inserts directly), month 2 (a repeat
 * import for that same reporting cycle with a removal + an addition), month
 * 3 (a reactivation of the month-2 removal, more bucket transitions, and a
 * deliberate EMI-due-date-vs-lender-bucket mismatch on one loan each).
 */
import ExcelJS from "exceljs";
import dayjs from "dayjs";

export function monthsAgo(n: number): string {
  return dayjs().subtract(n, "month").startOf("month").format("YYYY-MM-01");
}

/** DPD-anchored due date: N days before today, so the mismatch/agreement scenarios hold regardless of when this runs. */
function dueDateDaysAgo(days: number): string {
  return dayjs().subtract(days, "day").format("YYYY-MM-DD");
}

async function sheetFromRows(headers: string[], rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Allocation");
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r.map((v) => (v === null ? "" : v)));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Owner feedback round, Phase 2: mobile_number/pos(real)/agent_phone are now
// required-to-map too (product was already present for Alpha via PROD).
// appendRequired() below adds synthetic values for these to every row so the
// ~24 hand-crafted scenario rows across both companies' three months don't
// each need individual edits.
export const ALPHA_HEADERS = ["loan_agreement_no", "customername", "Bkt", "PROD", "pos", "emi_amount", "Mobile", "RealPos", "Agent"];
export const ALPHA_HEADERS_WITH_DUE_DATE = ["loan_agreement_no", "customername", "Bkt", "PROD", "pos", "emi_amount", "due_date", "Mobile", "RealPos", "Agent"];
export const ALPHA_MAPPING = {
  loan_agreement_no: "loan_number",
  customername: "customer_name",
  Bkt: "bucket",
  PROD: "product",
  pos: "due_amount",
  emi_amount: "emi",
  Mobile: "mobile_number",
  RealPos: "pos",
  Agent: "agent_phone",
};
export const ALPHA_MAPPING_WITH_DUE_DATE = { ...ALPHA_MAPPING, due_date: "emi_due_date" };

/** Appends synthetic Mobile/RealPos(=same as due_amount)/Agent values to every row. */
function appendRequired(
  rows: (string | number | null)[][],
  dueAmountColIndex: number,
): (string | number | null)[][] {
  return rows.map((r, i) => [...r, `98${String(i).padStart(8, "0")}`, r[dueAmountColIndex], ""]);
}

export async function alphaMonth1(): Promise<Buffer> {
  return sheetFromRows(ALPHA_HEADERS, appendRequired([
    ["ALPHA-001", "Ramesh Kumar", "X", "CVL", 15000, 1500],
    ["ALPHA-002", "Sita Devi", "1", "CVL", 25000, 2500],
    ["ALPHA-003", "Manoj Tiwari", "1", "LPL", 30000, 3000],
    ["ALPHA-004", "Priya Singh", "2", "CVL", 40000, 4000],
    ["ALPHA-005", "Ajay Verma", "X", "PBPLF", 18000, 1800],
    ["ALPHA-006", "Kavita Joshi", "NPA", "LPL", 60000, 6000],
    ["ALPHA-007", "Suresh Nair", "1", "CVL", 22000, 2200],
    ["ALPHA-008", "Deepa Menon", "X", "CVL", 19000, 1900],
  ], 4));
}

/** Repeat import for the same month: ALPHA-004 drops off (-> removal), ALPHA-009 is new (-> addition), rest transition buckets. */
export async function alphaMonth2(): Promise<Buffer> {
  return sheetFromRows(ALPHA_HEADERS, appendRequired([
    ["ALPHA-001", "Ramesh Kumar", "X", "CVL", 15000, 1500],
    ["ALPHA-002", "Sita Devi", "X", "CVL", 24000, 2500], // 1 -> X: normalized
    ["ALPHA-003", "Manoj Tiwari", "2", "LPL", 31000, 3000], // 1 -> 2: rolled forward
    // ALPHA-004 absent -> removal
    ["ALPHA-005", "Ajay Verma", "1", "PBPLF", 18500, 1800], // X -> 1: fell into arrears
    ["ALPHA-006", "Kavita Joshi", "NPA", "LPL", 59000, 6000],
    ["ALPHA-007", "Suresh Nair", "1", "CVL", 22500, 2200],
    ["ALPHA-008", "Deepa Menon", "X", "CVL", 19200, 1900],
    ["ALPHA-009", "Rohit Bhatia", "1", "CVL", 28000, 2800], // brand new -> addition
  ], 4));
}

/**
 * Repeat import again: ALPHA-004 reappears (-> reactivation, since it's
 * `recalled` from month 2's approved removal). ALPHA-008's due_date is set
 * ~75 days overdue while its lender bucket stays "X" (canonical 0) --
 * a deliberate DPD-vs-bucket mismatch. Also introduces the emi_due_date
 * column for the first time (a company can start sharing due dates any time).
 */
export async function alphaMonth3(): Promise<Buffer> {
  return sheetFromRows(ALPHA_HEADERS_WITH_DUE_DATE, appendRequired([
    ["ALPHA-001", "Ramesh Kumar", "1", "CVL", 15500, 1500, dueDateDaysAgo(40)], // X -> 1, agrees (30-59d)
    ["ALPHA-002", "Sita Devi", "X", "CVL", 0, 2500, dueDateDaysAgo(0)],
    ["ALPHA-003", "Manoj Tiwari", "NPA", "LPL", 32000, 3000, dueDateDaysAgo(95)],
    ["ALPHA-004", "Priya Singh", "1", "CVL", 41000, 4000, dueDateDaysAgo(35)], // reappears -> reactivation
    ["ALPHA-005", "Ajay Verma", "X", "PBPLF", 0, 1800, dueDateDaysAgo(0)], // paid back up
    ["ALPHA-006", "Kavita Joshi", "NPA", "LPL", 58000, 6000, dueDateDaysAgo(210)],
    ["ALPHA-007", "Suresh Nair", "2", "CVL", 23000, 2200, dueDateDaysAgo(65)],
    // Deliberate mismatch: lender still says "X" (canonical 0, not yet due),
    // but the due date implies 75 days overdue (canonical 2).
    ["ALPHA-008", "Deepa Menon", "X", "CVL", 19500, 1900, dueDateDaysAgo(75)],
    ["ALPHA-009", "Rohit Bhatia", "1", "CVL", 28500, 2800, dueDateDaysAgo(45)],
  ], 4));
}

// Beta never had a product column at all (unlike Alpha's PROD) -- Phase 2
// adds one (fixed "PersonalLoan" for every row, via appendBetaRequired)
// alongside the same mobile_number/pos(real)/agent_phone additions.
export const BETA_HEADERS = ["App Id", "Promoter Name", "Updated Bucket", "POS", "EMI", "Product", "Mobile", "RealPos", "Agent"];
export const BETA_HEADERS_WITH_DUE_DATE = ["App Id", "Promoter Name", "Updated Bucket", "POS", "EMI", "Next EMI Date", "Product", "Mobile", "RealPos", "Agent"];
export const BETA_MAPPING = {
  "App Id": "loan_number",
  "Promoter Name": "customer_name",
  "Updated Bucket": "bucket",
  POS: "due_amount",
  EMI: "emi",
  Product: "product",
  Mobile: "mobile_number",
  RealPos: "pos",
  Agent: "agent_phone",
};
export const BETA_MAPPING_WITH_DUE_DATE = { ...BETA_MAPPING, "Next EMI Date": "emi_due_date" };

/** Appends synthetic Product/Mobile/RealPos(=same as due_amount)/Agent values to every row. */
function appendBetaRequired(
  rows: (string | number | null)[][],
  dueAmountColIndex: number,
): (string | number | null)[][] {
  return rows.map((r, i) => [...r, "PersonalLoan", `98${String(i).padStart(8, "0")}`, r[dueAmountColIndex], ""]);
}

export async function betaMonth1(): Promise<Buffer> {
  return sheetFromRows(BETA_HEADERS, appendBetaRequired([
    ["BETA-101", "Naveen Kumar", "Current", 50000, 5000],
    ["BETA-102", "Sunita Rao", "30-60", 35000, 3500],
    ["BETA-103", "Vikas Malhotra", "60-90", 60000, 6000],
    ["BETA-104", "Anjali Gupta", "Current", 22000, 2200],
    ["BETA-105", "Rajesh Pillai", "NPA", 90000, 9000],
    ["BETA-106", "Meena Iyer", "30-60", 40000, 4000],
  ], 3));
}

/** Repeat import for the same month: BETA-103 drops off (-> removal), BETA-107 is new (-> addition). */
export async function betaMonth2(): Promise<Buffer> {
  return sheetFromRows(BETA_HEADERS, appendBetaRequired([
    ["BETA-101", "Naveen Kumar", "Current", 50000, 5000],
    ["BETA-102", "Sunita Rao", "Current", 34000, 3500], // paid up
    // BETA-103 absent -> removal
    ["BETA-104", "Anjali Gupta", "30-60", 22500, 2200], // fell behind
    ["BETA-105", "Rajesh Pillai", "NPA", 89000, 9000],
    ["BETA-106", "Meena Iyer", "60-90", 41000, 4000],
    ["BETA-107", "Priya Shah", "Current", 27000, 2700], // brand new -> addition
  ], 3));
}

/** Repeat import again: bucket transitions plus a deliberate DPD mismatch on BETA-106. */
export async function betaMonth3(): Promise<Buffer> {
  return sheetFromRows(BETA_HEADERS_WITH_DUE_DATE, appendBetaRequired([
    ["BETA-101", "Naveen Kumar", "30-60", 50500, 5000, dueDateDaysAgo(42)],
    ["BETA-102", "Sunita Rao", "Current", 0, 3500, dueDateDaysAgo(0)],
    ["BETA-104", "Anjali Gupta", "60-90", 23000, 2200, dueDateDaysAgo(70)],
    ["BETA-105", "Rajesh Pillai", "NPA", 88000, 9000, dueDateDaysAgo(240)],
    // Deliberate mismatch: lender still says "60-90" (canonical 2), but the
    // due date implies only 20 days overdue (canonical 0 -- not even 30d yet).
    ["BETA-106", "Meena Iyer", "60-90", 42000, 4000, dueDateDaysAgo(20)],
    ["BETA-107", "Priya Shah", "Current", 27500, 2700, dueDateDaysAgo(10)],
  ], 3));
}
