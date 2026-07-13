import { Pool, types } from "pg";
import { env } from "./env";
import { logger } from "./logger";

// node-postgres's default DATE (oid 1082) parser builds a JS Date at LOCAL
// midnight for the given y-m-d. Serializing that Date (res.json(), Array,
// JSON.stringify -- anything that calls .toISOString()) converts to UTC,
// which silently rolls the date back a day in any timezone ahead of UTC
// (IST included) -- e.g. a due_date of 2026-07-08 comes back as
// "2026-07-07T18:30:00.000Z" and API consumers read it as the 7th. DATE
// columns here are pure calendar dates (due_date, allocation_month, month,
// promised_date) with no time-of-day meaning, so keep them as the raw
// 'YYYY-MM-DD' string Postgres sends instead of ever constructing a Date.
types.setTypeParser(1082, (value) => value);

// node-postgres returns NUMERIC/DECIMAL (oid 1700) columns as strings by
// default, since they can exceed JS number precision. Every amount/count
// column here (due_amount, pos, emi, ptp amounts, etc.) fits safely in a JS
// double, and API consumers (mobile app, web) expect a JSON number -- parse
// it here once instead of relying on every consumer to defensively coerce.
types.setTypeParser(1700, (value) => (value === null ? null : parseFloat(value)));

// Single shared connection pool for the app.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

pool.on("error", (err) => {
  logger.error({ err }, "Unexpected error on idle Postgres client");
  process.exit(1);
});
