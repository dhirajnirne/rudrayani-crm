import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";
import { HttpError } from "../middleware/error-handler";
import { hashPassword } from "../services/auth-service";
import { capabilitiesHavePermission } from "../services/permission-service";
import { getSmsProvider } from "../services/sms/sms-provider";
import { logger } from "../config/logger";
import { capabilitiesOf, publicUser, type UserRow } from "../types/user";

const router = Router();
router.use(authenticate);

const capabilitySchema = z.object({
  is_operations_manager: z.boolean().optional(),
  is_team_leader: z.boolean().optional(),
  is_telecaller: z.boolean().optional(),
  is_field_agent: z.boolean().optional(),
});

const createSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  phone: z.string().length(10).regex(/^\d{10}$/, "Phone must be exactly 10 digits"),
  email: z.string().email().optional().nullable(),
  password: z.string().min(8),
  branch_id: z.string().uuid().optional().nullable(),
  team_id: z.string().uuid().optional().nullable(),
  capabilities: capabilitySchema.default({}),
});

const updateSchema = z.object({
  full_name: z.string().trim().min(1).max(200).optional(),
  email: z.string().email().optional().nullable(),
  branch_id: z.string().uuid().optional().nullable(),
  team_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
  capabilities: capabilitySchema.optional(),
});

/**
 * Brief Section 3 rules:
 *  - There is exactly one Agency Admin; it can never be granted through the API
 *    (bootstrap script only), so `is_agency_admin` is not even accepted here.
 *  - Granting or revoking Operations Manager requires the ops_managers.create
 *    permission — which only the Agency Admin capability holds.
 */
async function assertCanEditOpsManager(actor: UserRow): Promise<void> {
  const allowed = await capabilitiesHavePermission(capabilitiesOf(actor), "ops_managers.create");
  if (!allowed) {
    throw new HttpError(403, "Only the Agency Admin can add or remove an Operations Manager");
  }
}

/**
 * Best-effort: an employee (or their password reset) is useless until they
 * actually know the phone+password to log in with -- the exact confusion
 * that prompted this. Never let an SMS failure block account creation.
 */
async function notifyCredentials(phone: string, password: string, isReset: boolean): Promise<void> {
  try {
    const action = isReset ? "Your Rudrayani CRM password has been reset." : "Your Rudrayani CRM account is ready.";
    await getSmsProvider().sendSms(
      phone,
      `${action} Login with phone ${phone} and password ${password} on the web portal or mobile app. Please change your password after logging in.`,
    );
  } catch (err) {
    logger.warn({ err, phone }, "Failed to send employee credentials SMS (account/reset still succeeded)");
  }
}

async function assertBranchAndTeam(
  agencyId: string,
  branchId: string | null | undefined,
  teamId: string | null | undefined,
): Promise<void> {
  if (branchId) {
    const { rows } = await pool.query("SELECT 1 FROM branches WHERE id = $1 AND agency_id = $2", [
      branchId,
      agencyId,
    ]);
    if (rows.length === 0) throw new HttpError(400, "Branch not found in this agency");
  }
  if (teamId) {
    const { rows } = await pool.query(
      `SELECT t.branch_id FROM teams t JOIN branches b ON b.id = t.branch_id
        WHERE t.id = $1 AND b.agency_id = $2`,
      [teamId, agencyId],
    );
    if (rows.length === 0) throw new HttpError(400, "Team not found in this agency");
    if (branchId && rows[0].branch_id !== branchId) {
      throw new HttpError(400, "Team does not belong to the selected branch");
    }
  }
}

router.get(
  "/",
  requirePermission("employees.view"),
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const branchId = req.query.branch_id as string | undefined;
    const teamId = req.query.team_id as string | undefined;
    const { rows } = await pool.query<UserRow>(
      `SELECT u.* FROM users u
        WHERE u.agency_id = $1
          AND ($2::uuid IS NULL OR u.branch_id = $2)
          AND ($3::uuid IS NULL OR u.team_id = $3)
          AND ($4::text IS NULL OR u.full_name ILIKE '%' || $4 || '%' OR u.phone LIKE $4 || '%')
        ORDER BY u.full_name`,
      [req.user!.agency_id, branchId ?? null, teamId ?? null, q || null],
    );
    res.json({
      employees: rows.map((u) => ({ ...publicUser(u), is_active: u.is_active })),
    });
  }),
);

router.post(
  "/",
  requirePermission("employees.create"),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    if (body.capabilities.is_operations_manager) await assertCanEditOpsManager(req.user!);
    await assertBranchAndTeam(req.user!.agency_id, body.branch_id, body.team_id);

    const passwordHash = await hashPassword(body.password);
    const { rows } = await pool.query<UserRow>(
      `INSERT INTO users
         (agency_id, full_name, phone, email, password_hash, branch_id, team_id,
          is_operations_manager, is_team_leader, is_telecaller, is_field_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        req.user!.agency_id,
        body.full_name,
        body.phone,
        body.email ?? null,
        passwordHash,
        body.branch_id ?? null,
        body.team_id ?? null,
        body.capabilities.is_operations_manager ?? false,
        body.capabilities.is_team_leader ?? false,
        body.capabilities.is_telecaller ?? false,
        body.capabilities.is_field_agent ?? false,
      ],
    );
    await notifyCredentials(body.phone, body.password, false);
    res.status(201).json({ employee: { ...publicUser(rows[0]), is_active: rows[0].is_active } });
  }),
);

router.get(
  "/:id",
  requirePermission("employees.view"),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query<UserRow>(
      "SELECT * FROM users WHERE id = $1 AND agency_id = $2",
      [req.params.id, req.user!.agency_id],
    );
    if (!rows[0]) throw new HttpError(404, "Employee not found");
    res.json({ employee: { ...publicUser(rows[0]), is_active: rows[0].is_active } });
  }),
);

router.patch(
  "/:id",
  requirePermission("employees.update"),
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const { rows: existingRows } = await pool.query<UserRow>(
      "SELECT * FROM users WHERE id = $1 AND agency_id = $2",
      [req.params.id, req.user!.agency_id],
    );
    const existing = existingRows[0];
    if (!existing) throw new HttpError(404, "Employee not found");
    if (existing.is_agency_admin) {
      throw new HttpError(403, "The Agency Admin account cannot be modified here");
    }

    const opsFlagChanging =
      body.capabilities?.is_operations_manager !== undefined &&
      body.capabilities.is_operations_manager !== existing.is_operations_manager;
    if (opsFlagChanging) await assertCanEditOpsManager(req.user!);

    if (body.is_active === false) {
      const allowed = await capabilitiesHavePermission(
        capabilitiesOf(req.user!),
        "employees.deactivate",
      );
      if (!allowed) throw new HttpError(403, "Missing permission: employees.deactivate");
    }

    await assertBranchAndTeam(
      req.user!.agency_id,
      body.branch_id ?? existing.branch_id,
      body.team_id ?? existing.team_id,
    );

    const caps = body.capabilities ?? {};
    const { rows } = await pool.query<UserRow>(
      `UPDATE users SET
          full_name = COALESCE($3, full_name),
          email = COALESCE($4, email),
          branch_id = CASE WHEN $5::boolean THEN $6::uuid ELSE branch_id END,
          team_id = CASE WHEN $7::boolean THEN $8::uuid ELSE team_id END,
          is_active = COALESCE($9, is_active),
          is_operations_manager = COALESCE($10, is_operations_manager),
          is_team_leader = COALESCE($11, is_team_leader),
          is_telecaller = COALESCE($12, is_telecaller),
          is_field_agent = COALESCE($13, is_field_agent)
        WHERE id = $1 AND agency_id = $2
        RETURNING *`,
      [
        req.params.id,
        req.user!.agency_id,
        body.full_name ?? null,
        body.email ?? null,
        body.branch_id !== undefined,
        body.branch_id ?? null,
        body.team_id !== undefined,
        body.team_id ?? null,
        body.is_active ?? null,
        caps.is_operations_manager ?? null,
        caps.is_team_leader ?? null,
        caps.is_telecaller ?? null,
        caps.is_field_agent ?? null,
      ],
    );

    // Deactivation takes effect immediately: kill sessions.
    if (body.is_active === false) {
      await pool.query(
        "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
        [req.params.id],
      );
    }
    res.json({ employee: { ...publicUser(rows[0]), is_active: rows[0].is_active } });
  }),
);

const resetPasswordSchema = z.object({ new_password: z.string().min(8) });

router.post(
  "/:id/reset-password",
  requirePermission("employees.update"),
  asyncHandler(async (req, res) => {
    const body = resetPasswordSchema.parse(req.body);
    const { rows } = await pool.query<UserRow>(
      "SELECT * FROM users WHERE id = $1 AND agency_id = $2",
      [req.params.id, req.user!.agency_id],
    );
    if (!rows[0]) throw new HttpError(404, "Employee not found");
    if (rows[0].is_agency_admin) {
      throw new HttpError(403, "The Agency Admin password is reset via OTP or the seed script");
    }
    const passwordHash = await hashPassword(body.new_password);
    await pool.query(
      `UPDATE users SET password_hash = $2, failed_login_attempts = 0, locked_until = NULL
       WHERE id = $1`,
      [req.params.id, passwordHash],
    );
    await pool.query(
      "UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
      [req.params.id],
    );
    await notifyCredentials(rows[0].phone, body.new_password, true);
    res.json({ ok: true });
  }),
);

export default router;
