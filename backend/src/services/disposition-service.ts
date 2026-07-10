/**
 * Disposition structured-field handling (build brief Section 7): each code's
 * needs_* flags say which inputs the agent must supply; the final remark is
 * composed by substituting those values into the code's remark_template.
 * No runtime regex-parsing of placeholders into form fields — flags are the
 * source of truth, the template only shapes the sentence.
 */

export interface DispositionCodeRow {
  id: string;
  action_code: string;
  category: string | null;
  result_code: string | null;
  description: string | null;
  remark_template: string | null;
  // FV (field visit) or OC (on-call) -- NULL for legacy/custom codes an
  // admin hasn't tagged yet. Only used for filtering pickers on the client;
  // call-log submission itself doesn't branch on it.
  channel: "FV" | "OC" | null;
  needs_amount: boolean;
  needs_date: boolean;
  needs_time: boolean;
  needs_mode: boolean;
  needs_reason: boolean;
  needs_name_relation: boolean;
}

export interface DispositionFields {
  amount?: number;
  date?: string; // YYYY-MM-DD
  time?: string;
  mode?: string;
  reason?: string;
  name_relation?: string;
}

const FLAG_TO_FIELD = [
  ["needs_amount", "amount"],
  ["needs_date", "date"],
  ["needs_time", "time"],
  ["needs_mode", "mode"],
  ["needs_reason", "reason"],
  ["needs_name_relation", "name_relation"],
] as const;

/** Returns the list of field names required by the code but missing from input. */
export function missingRequiredFields(
  code: DispositionCodeRow,
  fields: DispositionFields,
): string[] {
  return FLAG_TO_FIELD.filter(
    ([flag, field]) => code[flag] && (fields[field] === undefined || fields[field] === ""),
  ).map(([, field]) => field);
}

// Templates from Trail_Codes.xlsx write placeholders inconsistently
// ("<amount>", "<Date>", "<Online payment mode>", "<name & relation>"), so we
// match any <...> token by the keyword it contains rather than exact text.
const PLACEHOLDER_PATTERNS: [RegExp, keyof DispositionFields][] = [
  [/<[^<>]*amount[^<>]*>/gi, "amount"],
  [/<[^<>]*mode[^<>]*>/gi, "mode"],
  [/<[^<>]*date[^<>]*>/gi, "date"],
  [/<[^<>]*time[^<>]*>/gi, "time"],
  [/<[^<>]*reason[^<>]*>/gi, "reason"],
  [/<[^<>]*(?:name|relation)[^<>]*>/gi, "name_relation"],
];

export function composeRemark(code: DispositionCodeRow, fields: DispositionFields): string {
  if (code.remark_template) {
    let remark = code.remark_template;
    for (const [pattern, field] of PLACEHOLDER_PATTERNS) {
      const value = fields[field];
      if (value !== undefined && value !== "") {
        remark = remark.replace(pattern, String(value));
      }
    }
    return remark;
  }
  // No template: description plus whatever structured values were given.
  const parts = FLAG_TO_FIELD.filter(([flag]) => code[flag])
    .map(([, field]) => (fields[field] !== undefined ? `${field}: ${fields[field]}` : null))
    .filter(Boolean);
  const base = code.description ?? code.result_code ?? code.action_code;
  return parts.length > 0 ? `${base} (${parts.join(", ")})` : base;
}

/**
 * A disposition creates a PTP record when it captures amount + promised date
 * and reads as a promise ("PTP", "TMPTP", category "PROMISE TO PAY") — but a
 * BROKEN PROMISE entry records history, it is not a fresh promise.
 */
export function createsPtp(code: DispositionCodeRow): boolean {
  if (!code.needs_amount || !code.needs_date) return false;
  const haystack = [code.result_code, code.category, code.description].filter(Boolean).join(" ");
  return /ptp|promise/i.test(haystack) && !/broken/i.test(haystack);
}
