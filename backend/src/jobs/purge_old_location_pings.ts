/**
 * Standalone runner for the location-ping purge (60-day retention).
 * The API server also runs this daily in-process via node-cron (see
 * scheduler.ts); keep this script for manual runs / external cron:
 *   npm run purge:pings
 */
import { pool } from "../config/db";
import { purgeOldLocationPings, PING_RETENTION_DAYS } from "./purge-pings";

purgeOldLocationPings()
  .then(async (count) => {
    console.log(`Purged ${count} location pings older than ${PING_RETENTION_DAYS} days`);
    await pool.end();
  })
  .catch((err) => {
    console.error("Purge job failed:", err);
    process.exit(1);
  });
