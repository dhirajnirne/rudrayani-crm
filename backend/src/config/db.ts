import { Pool } from "pg";
import { env } from "./env";
import { logger } from "./logger";

// Single shared connection pool for the app.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

pool.on("error", (err) => {
  logger.error({ err }, "Unexpected error on idle Postgres client");
  process.exit(1);
});
