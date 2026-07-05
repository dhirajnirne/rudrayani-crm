/**
 * Deletes location_pings older than the retention window (60 days, confirmed).
 *
 * Run daily via cron, e.g. a crontab entry on your server:
 *   0 3 * * * cd /path/to/backend && npm run purge:pings >> purge.log 2>&1
 *
 * Locally, you can just run it manually:
 *   npm run purge:pings
 */
import { pool } from "../config/db";

const RETENTION_DAYS = 60;

async function run(): Promise<void> {
  const result = await pool.query(
    `DELETE FROM location_pings WHERE recorded_at < now() - interval '${RETENTION_DAYS} days'`,
  );
  console.log(`Purged ${result.rowCount} location pings older than ${RETENTION_DAYS} days`);
  await pool.end();
}

run().catch((err) => {
  console.error("Purge job failed:", err);
  process.exit(1);
});
