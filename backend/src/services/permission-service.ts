import { pool } from "../config/db";
import type { Capability } from "../types/user";

/** Checks the capability_permissions table (data-driven, brief Section 3). */
export async function capabilitiesHavePermission(
  capabilities: Capability[],
  permissionKey: string,
): Promise<boolean> {
  if (capabilities.length === 0) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM capability_permissions
      WHERE capability = ANY($1) AND permission_key = $2
      LIMIT 1`,
    [capabilities, permissionKey],
  );
  return rows.length > 0;
}

export async function permissionsFor(capabilities: Capability[]): Promise<string[]> {
  if (capabilities.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT DISTINCT permission_key FROM capability_permissions WHERE capability = ANY($1)`,
    [capabilities],
  );
  return rows.map((r) => r.permission_key as string);
}
