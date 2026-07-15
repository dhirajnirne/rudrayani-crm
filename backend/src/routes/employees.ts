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
import { capabilitiesOf, publicUser, booleansForDesignation, type UserRow, type Capability } from "../types/user";

const router = Router();
router.use(authenticate);

const designationSchema = z.enum(["operations_manager", "team_leader", "telecaller", "field_agent"]);

const createSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  phone: z.string().length(10).regex(/^\d{10}$/, "Phone must be exactly 10 digits"),
  email: z.string().email().optional().nullable(),
  password: z.string().min(8),
  branch_id: z.string().uuid().optional().nullable(),
  team_id: z.string().uuid().optional().nullable(),
  manager_id: z.string().uuid().optional().nullable(),
  designation: designationSchema,
});

const updateSchema = z.object({
  full_name: z.string().trim().min(1).max(200).optional(),
  email: z.string().email().optional().nullable(),
  branch_id: z.string().uuid().optional().nullable(),
  team_id: z.string().uuid().optional().nullable(),
  manager_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
  designation: designationSchema.optional(),
});

/**
 * Brief Section 3 rules:
 *  - There is exactly one Agency Admin; it can never be granted through the API
 *    (bootstrap script only), so `is_agency_admin` is not even accepted here.
 *  - Granting or revoking Operations Manager requires the ops_managers.create
 *    permission — which only the Agency Admin capability holds.
 */
async function assertCanEditOpsManager(actor: UserRow, designation?: Capability): Promise<void> {
  // Only check if setting designation to operations_manager
  if (designation === "operations_manager") {
    const allowed = await capabilitiesHavePermission(capabilitiesOf(actor), "ops_managers.create");
    if (!allowed) {
      throw new HttpError(403, "Only the Agency Admin can add or remove an Operations Manager");
    }
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

/**
 * Hard hierarchy enforcement: non-admin designations MUST have a manager
 * whose designation is exactly the next rank up in the fixed chain:
 * - operations_manager → manager is agency_admin (via assertCanEditOpsManager)
 * - team_leader → manager is operations_manager
 * - telecaller / field_agent → manager is team_leader
 * - agency_admin → no manager allowed
 *
 * Forward-only enforcement: only validates when designation or manager_id
 * is part of the write payload, not on every unrelated edit.
 */
async function assertManager(
  agencyId: string,
  designation: Capability | null,
  managerId: string | null | undefined,
  selfId?: string,
): Promise<void> {
  if (!designation || designation === "agency_admin") {
    // Admin requires no manager
    if (managerId) {
      throw new HttpError(400, "An agency admin cannot have a manager");
    }
    return;
  }

  if (!managerId) {
    throw new HttpError(400, `${designation} requires a manager`);
  }

  if (selfId && managerId === selfId) {
    throw new HttpError(400, "An employee cannot be their own manager");
  }

  // Look up manager's designation and validate it's exactly one rank up
  const expectedManagerDesignation: Record<Capability, Capability> = {
    operations_manager: "agency_admin",
    team_leader: "operations_manager",
    telecaller: "team_leader",
    field_agent: "team_leader",
    agency_admin: "agency_admin", // unreachable but needed for type completeness
  };

  const requiredDesignation = expectedManagerDesignation[designation];
  const { rows } = await pool.query<{ designation: string }>(
    "SELECT designation FROM users WHERE id = $1 AND agency_id = $2",
    [managerId, agencyId],
  );

  if (rows.length === 0) {
    throw new HttpError(400, "Manager not found in this agency");
  }

  if (rows[0].designation !== requiredDesignation) {
    throw new HttpError(
      400,
      `Manager must be a ${requiredDesignation} (this employee is a ${designation})`,
    );
  }
}

router.get(
  "/",
  requirePermission("employees.view"),
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const branchId = req.query.branch_id as string | undefined;
    const teamId = req.query.team_id as string | undefined;
    const designation = req.query.designation as string | undefined;
    const customerBranchId = req.query.customer_branch_id as string | undefined;
    const product = req.query.product as string | undefined;
    // Phase 12 (Management Dashboard "Active Agents" KPI): lets the client
    // get a pre-filtered count instead of fetching everyone and filtering
    // client-side. Omitted -> unfiltered (unchanged pre-Phase-12 behavior).
    const isActiveRaw = req.query.is_active as string | undefined;
    const isActive = isActiveRaw === undefined ? null : isActiveRaw === "true";

    const params: unknown[] = [
      req.user!.agency_id,
      branchId ?? null,
      teamId ?? null,
      q || null,
      isActive,
      designation ?? null,
    ];

    let conditions = `WHERE u.agency_id = $1
          AND ($2::uuid IS NULL OR u.branch_id = $2)
          AND ($3::uuid IS NULL OR u.team_id = $3)
          AND ($4::text IS NULL OR u.full_name ILIKE '%' || $4 || '%' OR u.phone LIKE $4 || '%')
          AND ($5::boolean IS NULL OR u.is_active = $5)
          AND ($6::text IS NULL OR u.designation = $6)`;

    if (customerBranchId) {
      params.push(customerBranchId);
      conditions += ` AND EXISTS (SELECT 1 FROM customers c WHERE (c.assigned_agent_id = u.id OR c.assigned_field_agent_id = u.id) AND c.branch_id = $${params.length})`;
    }
    if (product) {
      params.push(product);
      conditions += ` AND EXISTS (SELECT 1 FROM customers c WHERE (c.assigned_agent_id = u.id OR c.assigned_field_agent_id = u.id) AND c.product = $${params.length})`;
    }

    const { rows } = await pool.query<UserRow>(
      `SELECT u.* FROM users u ${conditions} ORDER BY u.full_name`,
      params,
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
    await assertCanEditOpsManager(req.user!, body.designation);
    await assertBranchAndTeam(req.user!.agency_id, body.branch_id, body.team_id);
    await assertManager(req.user!.agency_id, body.designation as Capability, body.manager_id);

    const passwordHash = await hashPassword(body.password);
    const booleans = booleansForDesignation(body.designation);
    const { rows } = await pool.query<UserRow>(
      `INSERT INTO users
         (agency_id, full_name, phone, email, password_hash, branch_id, team_id, manager_id, designation,
          is_operations_manager, is_team_leader, is_telecaller, is_field_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        req.user!.agency_id,
        body.full_name,
        body.phone,
        body.email ?? null,
        passwordHash,
        body.branch_id ?? null,
        body.team_id ?? null,
        body.manager_id ?? null,
        body.designation,
        booleans.is_operations_manager,
        booleans.is_team_leader,
        booleans.is_telecaller,
        booleans.is_field_agent,
      ],
    );
    await notifyCredentials(body.phone, body.password, false);
    res.status(201).json({ employee: { ...publicUser(rows[0]), is_active: rows[0].is_active } });
  }),
);

/**
 * Org chart data: agency -> branches -> teams -> agents, with each agent's
 * manager_id/manager_name attached so the frontend can draw report-to edges
 * within a team (or a branch's/agency's "unassigned" bucket). Registered
 * ahead of GET /:id so "org-hierarchy" isn't swallowed as a :id param.
 */
router.get(
  "/org-hierarchy",
  requirePermission("employees.view"),
  asyncHandler(async (req, res) => {
    const agencyId = req.user!.agency_id;

    const { rows: agencyRows } = await pool.query<{ id: string; name: string }>(
      "SELECT id, name FROM agencies WHERE id = $1",
      [agencyId],
    );
    const { rows: branches } = await pool.query<{ id: string; name: string }>(
      "SELECT id, name FROM branches WHERE agency_id = $1 ORDER BY name",
      [agencyId],
    );
    const { rows: teams } = await pool.query<{ id: string; name: string; branch_id: string }>(
      `SELECT t.id, t.name, t.branch_id FROM teams t
         JOIN branches b ON b.id = t.branch_id
        WHERE b.agency_id = $1
        ORDER BY t.name`,
      [agencyId],
    );
    const { rows: users } = await pool.query<UserRow>(
      "SELECT * FROM users WHERE agency_id = $1 ORDER BY full_name",
      [agencyId],
    );

    // Fetch team_leaders for multi-team TL support
    const { rows: teamLeaders } = await pool.query<{ user_id: string; team_id: string }>(
      `SELECT tl.user_id, tl.team_id FROM team_leaders tl
         JOIN users u ON u.id = tl.user_id
        WHERE u.agency_id = $1`,
      [agencyId],
    );
    const leadersByTeam = new Map<string, string[]>();
    for (const tl of teamLeaders) {
      if (!leadersByTeam.has(tl.team_id)) leadersByTeam.set(tl.team_id, []);
      leadersByTeam.get(tl.team_id)!.push(tl.user_id);
    }

    const nameById = new Map(users.map((u) => [u.id, u.full_name]));
    const userById = new Map(users.map((u) => [u.id, u]));
    const toAgent = (u: UserRow) => ({
      ...publicUser(u),
      is_active: u.is_active,
      manager_name: u.manager_id ? (nameById.get(u.manager_id) ?? null) : null,
    });

    const branchTree = branches.map((b) => ({
      id: b.id,
      name: b.name,
      teams: teams
        .filter((t) => t.branch_id === b.id)
        .map((t) => {
          const agentsInTeam = users.filter((u) => u.team_id === t.id);
          const leadersInTeam = (leadersByTeam.get(t.id) ?? [])
            .map((lid) => userById.get(lid))
            .filter((u): u is UserRow => u !== undefined);
          return {
            id: t.id,
            name: t.name,
            agents: [...agentsInTeam, ...leadersInTeam].map(toAgent),
          };
        }),
      unassigned_agents: users
        .filter((u) => u.branch_id === b.id && !u.team_id && u.designation !== 'team_leader')
        .map(toAgent),
    }));

    const agencyUnassigned = users.filter((u) => !u.branch_id && u.designation !== 'team_leader').map(toAgent);

    res.json({
      agency: agencyRows[0] ?? null,
      branches: branchTree,
      unassigned_agents: agencyUnassigned,
    });
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

    if (body.designation) {
      await assertCanEditOpsManager(req.user!, body.designation);
    }

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
    // Validate hierarchy only if designation or manager_id is being changed
    if (body.manager_id !== undefined || body.designation) {
      const designation = (body.designation ?? existing.designation) as Capability;
      const managerId = body.manager_id !== undefined ? body.manager_id : existing.manager_id;
      await assertManager(req.user!.agency_id, designation, managerId, existing.id);
    }

    const booleans = body.designation ? booleansForDesignation(body.designation) : null;
    const { rows } = await pool.query<UserRow>(
      `UPDATE users SET
          full_name = COALESCE($3, full_name),
          email = COALESCE($4, email),
          branch_id = CASE WHEN $5::boolean THEN $6::uuid ELSE branch_id END,
          team_id = CASE WHEN $7::boolean THEN $8::uuid ELSE team_id END,
          manager_id = CASE WHEN $14::boolean THEN $15::uuid ELSE manager_id END,
          designation = COALESCE($16, designation),
          is_active = COALESCE($9, is_active),
          is_operations_manager = CASE WHEN $16::text IS NOT NULL THEN $17::boolean ELSE is_operations_manager END,
          is_team_leader = CASE WHEN $16::text IS NOT NULL THEN $18::boolean ELSE is_team_leader END,
          is_telecaller = CASE WHEN $16::text IS NOT NULL THEN $19::boolean ELSE is_telecaller END,
          is_field_agent = CASE WHEN $16::text IS NOT NULL THEN $20::boolean ELSE is_field_agent END
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
        null, // $10 (unused)
        null, // $11 (unused)
        null, // $12 (unused)
        null, // $13 (unused)
        body.manager_id !== undefined,
        body.manager_id ?? null,
        body.designation ?? null,
        booleans?.is_operations_manager ?? null,
        booleans?.is_team_leader ?? null,
        booleans?.is_telecaller ?? null,
        booleans?.is_field_agent ?? null,
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

// Assign branches to a telecaller (replace-set, used for multi-branch assignment)
router.put(
  "/:id/branches",
  requirePermission("employees.update"),
  asyncHandler(async (req, res) => {
    const body = z.object({ branch_ids: z.array(z.string().uuid()) }).parse(req.body);

    // Fetch user and verify they're a telecaller
    const { rows: userRows } = await pool.query<UserRow>(
      "SELECT * FROM users WHERE id = $1 AND agency_id = $2",
      [req.params.id, req.user!.agency_id],
    );
    if (!userRows[0]) throw new HttpError(404, "Employee not found");
    if (userRows[0].designation !== "telecaller") {
      throw new HttpError(400, "Only telecallers can have multiple branches assigned");
    }

    // Validate all branches belong to this agency
    if (body.branch_ids.length > 0) {
      const { rows: branches } = await pool.query(
        "SELECT id FROM branches WHERE id = ANY($1::uuid[]) AND agency_id = $2",
        [body.branch_ids, req.user!.agency_id],
      );
      if (branches.length !== body.branch_ids.length) {
        throw new HttpError(400, "One or more branches not found in this agency");
      }
    }

    // Replace telecaller_branches entries
    await pool.query("DELETE FROM telecaller_branches WHERE user_id = $1", [req.params.id]);
    if (body.branch_ids.length > 0) {
      await pool.query(
        "INSERT INTO telecaller_branches (user_id, branch_id) SELECT $1, unnest($2::uuid[])",
        [req.params.id, body.branch_ids],
      );
    }

    res.json({ success: true });
  }),
);

export default router;
