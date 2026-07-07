import { pool } from "../config/db";

/** Location-ping retention window (60 days, confirmed in brief Section 9). */
export const PING_RETENTION_DAYS = 60;

export async function purgeOldLocationPings(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM location_pings WHERE recorded_at < now() - make_interval(days => $1)`,
    [PING_RETENTION_DAYS],
  );
  return result.rowCount ?? 0;
}
