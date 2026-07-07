import cron from "node-cron";
import { logger } from "../config/logger";
import { purgeOldLocationPings, PING_RETENTION_DAYS } from "./purge-pings";

/**
 * In-process scheduled jobs, started from server.ts only (never in tests).
 * Task 4.1: daily location-ping purge at 03:00 (60-day retention, brief §9).
 */
export function startScheduledJobs(): void {
  cron.schedule("0 3 * * *", async () => {
    try {
      const purged = await purgeOldLocationPings();
      logger.info(`Purge job: removed ${purged} location pings older than ${PING_RETENTION_DAYS} days`);
    } catch (err) {
      logger.error({ err }, "Purge job failed");
    }
  });
  logger.info("Scheduled jobs started (ping purge daily at 03:00)");
}
