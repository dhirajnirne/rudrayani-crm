import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../config/db";
import { env } from "../config/env";
import { HttpError } from "./error-handler";
import { capabilitiesOf, type UserRow } from "../types/user";
import { asyncHandler } from "./async-handler";

/**
 * Verifies the Bearer access token and loads the user fresh from the DB so
 * deactivation / capability changes take effect immediately, not at token expiry.
 */
export const authenticate = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Missing access token");

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(header.slice("Bearer ".length), env.JWT_SECRET) as jwt.JwtPayload;
    } catch {
      throw new HttpError(401, "Invalid or expired access token");
    }

    const { rows } = await pool.query<UserRow>("SELECT * FROM users WHERE id = $1", [payload.sub]);
    const user = rows[0];
    if (!user || !user.is_active) throw new HttpError(401, "Account not found or deactivated");

    req.user = user;
    next();
  },
);

/**
 * Permission guard on top of authenticate. Permissions come from the
 * capability_permissions table (data, not code — build brief Section 3).
 */
export function requirePermission(permissionKey: string) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) throw new HttpError(401, "Not authenticated");

    const capabilities = capabilitiesOf(user);
    if (capabilities.length === 0) throw new HttpError(403, "No capabilities assigned");

    const { rows } = await pool.query(
      `SELECT 1 FROM capability_permissions
        WHERE capability = ANY($1) AND permission_key = $2
        LIMIT 1`,
      [capabilities, permissionKey],
    );
    if (rows.length === 0) {
      throw new HttpError(403, `Missing permission: ${permissionKey}`);
    }
    next();
  });
}
