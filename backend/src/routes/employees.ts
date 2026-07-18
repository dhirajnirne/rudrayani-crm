import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";
import { HttpError } from "../middleware/error-handler";
import { hashPassword } from "../services/auth-service";
import { capabilitiesHavePermission } from "../services/permission-service";
import { dimensionBreakdown, type BreakdownRow } from "../services/report-service";
import { getSmsProvider } from "../services/sms/sms-provider";
import { logger } from "../config/logger";
import {
  capabilitiesOf,
  publicUser,
  booleansForDesignation,
  type UserRow,
  type Capability,
  type AgentType,
} from "../types/user";

const router = Router();
router.use(authenticate);

const designationSchema = z.enum(["operations_manager", "branch_manager", "team_leader", "telecaller", "field_agent"]);

const agentTypeSchema = z.enum(["telecaller", "field_agent"]);

const createSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  phone: z.string().length(10).regex(/^\d{10}$/, "Phone must be exactly 10 digits"),
  email: z.string().email().optional().nullable(),
  password: z.string().min(8),
  branch_id: z.string().uuid().optional().nullable(),
  team_id: z.string().uuid().optional().nullable(),
  manager_id: z.string().uuid().optional().nullable(),
  designation: designationSchema,
  agent_type: agentTypeSchema.optional().nullable(),
});

const updateSchema = z.object({
  full_name: z.string().trim().min(1).max(200).optional(),
  email: z.string().email().optional().nullable(),
  branch_id: z.string().uuid().optional().nullable(),
  team_id: z.string().uuid().optional().nullable(),
  manager_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
  designation: designationSchema.optional(),
  agent_type: agentTypeSchema.optional().nullable(),
});

/** Human-readable names for error messages -- never surface raw enum values to users. */
const DESIGNATION_LABELS: Record<Capability, string> = {
  agency_admin: "Agency Admin",
  operations_manager: "Operations Manager",
  branch_manager: "Branch Manager",
  team_leader: "Team Leader",
  telecaller: "Telecaller",
  field_agent: "Field Agent",
};
const label = (d: string): string => DESIGNATION_LABELS[d as Capability] ?? d;

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
      throw new HttpError(
        403,
        "Only the Agency Admin can create or edit Operations Managers. Ask your Agency Admin to make this change.",
      );
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
    if (rows.length === 0) {
      throw new HttpError(400, "The selected branch could not be found. Please choose a branch from the list.");
    }
  }
  if (teamId) {
    const { rows } = await pool.query(
      `SELECT t.branch_id FROM teams t JOIN branches b ON b.id = t.branch_id
        WHERE t.id = $1 AND b.agency_id = $2`,
      [teamId, agencyId],
    );
    if (rows.length === 0) {
      throw new HttpError(400, "The selected team could not be found. Please choose a team from the list.");
    }
    if (branchId && rows[0].branch_id !== branchId) {
      throw new HttpError(
        400,
        "The selected team belongs to a different branch. Choose a team from the selected branch, or clear the branch first.",
      );
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
// branch_manager is a sibling of team_leader in this chain (both report to
// operations_manager) -- its authority over a branch's teams comes from a
// wider scope (see scope.ts/report-service.ts), not from being anyone's
// formal manager.
const EXPECTED_MANAGER_DESIGNATION: Record<Capability, Capability> = {
  operations_manager: "agency_admin",
  branch_manager: "operations_manager",
  team_leader: "operations_manager",
  telecaller: "team_leader",
  field_agent: "team_leader",
  agency_admin: "agency_admin", // unreachable but needed for type completeness
};

async function assertManager(
  agencyId: string,
  designation: Capability | null,
  managerId: string | null | undefined,
  selfId?: string,
): Promise<void> {
  if (!designation || designation === "agency_admin") {
    // Admin requires no manager
    if (managerId) {
      throw new HttpError(
        400,
        "Agency Admin is the top of the hierarchy and cannot report to anyone. Clear the \"Reports to\" field to continue.",
      );
    }
    return;
  }

  // Look up this designation's required manager rank up front so every
  // message below can say exactly what to pick, not just what's wrong.
  const requiredDesignation = EXPECTED_MANAGER_DESIGNATION[designation];

  if (!managerId) {
    throw new HttpError(
      400,
      `A ${label(designation)} must report to a manager. Select a ${label(requiredDesignation)} in "Reports to" before saving.`,
    );
  }

  if (selfId && managerId === selfId) {
    throw new HttpError(
      400,
      "An employee cannot report to themselves. Choose a different manager in \"Reports to\".",
    );
  }

  const { rows } = await pool.query<{ designation: string }>(
    "SELECT designation FROM users WHERE id = $1 AND agency_id = $2",
    [managerId, agencyId],
  );

  if (rows.length === 0) {
    throw new HttpError(
      400,
      "The selected manager could not be found. Please pick another manager from the list.",
    );
  }

  if (rows[0].designation !== requiredDesignation) {
    throw new HttpError(
      400,
      `You selected ${label(rows[0].designation)} as the manager, but a ${label(designation)} must report ` +
        `to a ${label(requiredDesignation)} directly. Please select a ${label(requiredDesignation)} in "Reports to" instead.`,
    );
  }
}

/**
 * agent_type lets a branch_manager/team_leader ALSO carry collections work
 * (telecaller-type or field-agent-type) alongside their management rank --
 * "additional responsibilities, the core work remains the same." Returns the
 * value that should actually be written.
 *  - telecaller/field_agent designations: agent_type must mirror designation
 *    if provided; the server always writes the mirrored value regardless
 *    (never trusts a client-supplied mismatch).
 *  - branch_manager/team_leader: agent_type may be null, "telecaller", or
 *    "field_agent", freely client-settable.
 *  - agency_admin/operations_manager: agent_type must be null/omitted.
 */
function assertAgentType(
  designation: Capability,
  agentType: AgentType | null | undefined,
): AgentType | null {
  if (designation === "telecaller" || designation === "field_agent") {
    if (agentType !== undefined && agentType !== null && agentType !== designation) {
      throw new HttpError(
        400,
        `A ${label(designation)}'s work type is always "${label(designation)}" -- it's set automatically and doesn't need to be chosen separately.`,
      );
    }
    return designation;
  }
  if (designation === "branch_manager" || designation === "team_leader") {
    return agentType ?? null;
  }
  // agency_admin / operations_manager
  if (agentType) {
    throw new HttpError(
      400,
      `${label(designation)} is a management-only role and cannot also do collections work. Remove the "Also does collections work as" selection.`,
    );
  }
  return null;
}

/**
 * branch_ids/team_ids are write-only via PUT /:id/branches and /:id/teams
 * (junction tables, not columns on users) -- without this, an edit form
 * re-opening a telecaller-type employee would only ever see their single
 * scalar branch_id/team_id, silently losing every other assignment. Batches
 * one query per table across the whole result set rather than N+1.
 */
async function attachMultiAssignments<T extends { id: string; designation: string; agent_type: string | null }>(
  users: T[],
): Promise<(T & { branch_ids?: string[]; team_ids?: string[] })[]> {
  const telecallerTypeIds = users
    .filter((u) => u.designation === "telecaller" || u.agent_type === "telecaller")
    .map((u) => u.id);
  if (telecallerTypeIds.length === 0) return users;

  const [{ rows: branchRows }, { rows: teamRows }] = await Promise.all([
    pool.query<{ user_id: string; branch_id: string }>(
      "SELECT user_id, branch_id FROM telecaller_branches WHERE user_id = ANY($1::uuid[])",
      [telecallerTypeIds],
    ),
    pool.query<{ user_id: string; team_id: string }>(
      "SELECT user_id, team_id FROM telecaller_teams WHERE user_id = ANY($1::uuid[])",
      [telecallerTypeIds],
    ),
  ]);
  const branchesByUser = new Map<string, string[]>();
  for (const r of branchRows) {
    if (!branchesByUser.has(r.user_id)) branchesByUser.set(r.user_id, []);
    branchesByUser.get(r.user_id)!.push(r.branch_id);
  }
  const teamsByUser = new Map<string, string[]>();
  for (const r of teamRows) {
    if (!teamsByUser.has(r.user_id)) teamsByUser.set(r.user_id, []);
    teamsByUser.get(r.user_id)!.push(r.team_id);
  }

  return users.map((u) =>
    telecallerTypeIds.includes(u.id)
      ? { ...u, branch_ids: branchesByUser.get(u.id) ?? [], team_ids: teamsByUser.get(u.id) ?? [] }
      : u,
  );
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
    const withMulti = await attachMultiAssignments(rows);
    res.json({
      employees: withMulti.map((u) => ({
        ...publicUser(u),
        is_active: u.is_active,
        branch_ids: u.branch_ids,
        team_ids: u.team_ids,
      })),
    });
  }),
);

router.post(
  "/",
  requirePermission("employees.create"),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    await assertCanEditOpsManager(req.user!, body.designation);
    const agentType = assertAgentType(body.designation as Capability, body.agent_type);
    await assertBranchAndTeam(req.user!.agency_id, body.branch_id, body.team_id);
    await assertManager(req.user!.agency_id, body.designation as Capability, body.manager_id);

    const passwordHash = await hashPassword(body.password);
    const booleans = booleansForDesignation(body.designation, agentType);
    const { rows } = await pool.query<UserRow>(
      `INSERT INTO users
         (agency_id, full_name, phone, email, password_hash, branch_id, team_id, manager_id, designation, agent_type,
          is_operations_manager, is_team_leader, is_telecaller, is_field_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
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
        agentType,
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
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

router.get(
  "/org-hierarchy",
  requirePermission("employees.view"),
  asyncHandler(async (req, res) => {
    const agencyId = req.user!.agency_id;
    const query = z
      .object({
        with_performance: z
          .union([z.literal("true"), z.literal("false")])
          .optional()
          .transform((v) => v === "true"),
        month: z.string().regex(MONTH_RE, "month must be YYYY-MM").optional(),
      })
      .parse(req.query);

    const { rows: agencyRows } = await pool.query<{ id: string; name: string }>(
      "SELECT id, name FROM agencies WHERE id = $1",
      [agencyId],
    );
    const { rows: branches } = await pool.query<{ id: string; name: string; branch_manager_id: string | null }>(
      "SELECT id, name, branch_manager_id FROM branches WHERE agency_id = $1 ORDER BY name",
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

    // Reuse-first: performance numbers come straight from the same
    // dimensionBreakdown() that already powers /reports/breakdown -- no
    // bespoke aggregation here. Opt-in via ?with_performance=true so plain
    // roster callers (existing OrgChartPage usage) are unaffected.
    let perfByBranch = new Map<string, BreakdownRow>();
    let perfByTeam = new Map<string, BreakdownRow>();
    let perfByAgent = new Map<string, BreakdownRow>();
    if (query.with_performance) {
      const month = query.month ?? new Date().toISOString().slice(0, 7);
      const filters = { month: `${month}-01` };
      const [branchRows, teamRows, agentRows] = await Promise.all([
        dimensionBreakdown(req.user!, filters, true, "branch"),
        dimensionBreakdown(req.user!, filters, true, "team"),
        dimensionBreakdown(req.user!, filters, true, "agent"),
      ]);
      perfByBranch = new Map(branchRows.filter((r) => r.key).map((r) => [r.key as string, r]));
      perfByTeam = new Map(teamRows.filter((r) => r.key).map((r) => [r.key as string, r]));
      perfByAgent = new Map(agentRows.filter((r) => r.key).map((r) => [r.key as string, r]));
    }
    const perfFor = (map: Map<string, BreakdownRow>, key: string) => {
      const row = map.get(key);
      if (!row) return undefined;
      return {
        collected_amount: row.collected_amount,
        target_amount: row.target_amount,
        achievement_pct: row.achievement_pct,
      };
    };

    // branch_manager (like team_leader) is a management rank, not a plain
    // team member -- exclude from team/branch agent lists the same way
    // team_leader already is.
    const isPlainAgent = (u: UserRow) => u.designation !== "team_leader" && u.designation !== "branch_manager";

    const branchTree = branches.map((b) => ({
      id: b.id,
      name: b.name,
      branch_manager: b.branch_manager_id
        ? { id: b.branch_manager_id, full_name: nameById.get(b.branch_manager_id) ?? null }
        : null,
      ...(query.with_performance ? { performance: perfFor(perfByBranch, b.id) ?? null } : {}),
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
            ...(query.with_performance ? { performance: perfFor(perfByTeam, t.id) ?? null } : {}),
            agents: [...agentsInTeam, ...leadersInTeam].map((u) => ({
              ...toAgent(u),
              ...(query.with_performance ? { performance: perfFor(perfByAgent, u.id) ?? null } : {}),
            })),
          };
        }),
      unassigned_agents: users.filter((u) => u.branch_id === b.id && !u.team_id && isPlainAgent(u)).map(toAgent),
    }));

    const agencyUnassigned = users.filter((u) => !u.branch_id && isPlainAgent(u)).map(toAgent);

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
    const [withMulti] = await attachMultiAssignments(rows);
    res.json({
      employee: {
        ...publicUser(withMulti),
        is_active: withMulti.is_active,
        branch_ids: withMulti.branch_ids,
        team_ids: withMulti.team_ids,
      },
    });
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

    // Recompute agent_type whenever designation or agent_type itself changes
    // -- the effective designation determines what agent_type values are
    // even valid (see assertAgentType()).
    const agentTypeChanging = body.designation !== undefined || body.agent_type !== undefined;
    let newAgentType: AgentType | null = existing.agent_type;
    if (agentTypeChanging) {
      const effectiveDesignation = (body.designation ?? existing.designation) as Capability;
      const isAgentDesignation = effectiveDesignation === "telecaller" || effectiveDesignation === "field_agent";
      // telecaller/field_agent always auto-mirror their own agent_type
      // regardless of history, so a stale existing.agent_type left over from
      // a *different* prior designation must never be treated as an explicit
      // (and possibly conflicting) request here -- e.g. changing a telecaller
      // to a field_agent without resending agent_type would otherwise compare
      // the new "field_agent" designation against the old "telecaller" value
      // and wrongly reject the edit. branch_manager/team_leader still carry
      // the existing value over unless the client overrides it, preserving
      // dual-capability across a promotion between the two management ranks.
      const requestedAgentType =
        body.agent_type !== undefined ? body.agent_type : isAgentDesignation ? undefined : existing.agent_type;
      newAgentType = assertAgentType(effectiveDesignation, requestedAgentType);
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

    const booleans = agentTypeChanging
      ? booleansForDesignation((body.designation ?? existing.designation) as Capability, newAgentType)
      : null;
    const { rows } = await pool.query<UserRow>(
      `UPDATE users SET
          full_name = COALESCE($3, full_name),
          email = COALESCE($4, email),
          branch_id = CASE WHEN $5::boolean THEN $6::uuid ELSE branch_id END,
          team_id = CASE WHEN $7::boolean THEN $8::uuid ELSE team_id END,
          manager_id = CASE WHEN $10::boolean THEN $11::uuid ELSE manager_id END,
          designation = COALESCE($12, designation),
          agent_type = CASE WHEN $17::boolean THEN $18::text ELSE agent_type END,
          is_active = COALESCE($9, is_active),
          is_operations_manager = CASE WHEN $12::text IS NOT NULL THEN $13::boolean ELSE is_operations_manager END,
          is_team_leader = CASE WHEN $12::text IS NOT NULL THEN $14::boolean ELSE is_team_leader END,
          is_telecaller = CASE WHEN $17::boolean THEN $15::boolean ELSE is_telecaller END,
          is_field_agent = CASE WHEN $17::boolean THEN $16::boolean ELSE is_field_agent END
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
        body.manager_id !== undefined,
        body.manager_id ?? null,
        body.designation ?? null,
        booleans?.is_operations_manager ?? null,
        booleans?.is_team_leader ?? null,
        booleans?.is_telecaller ?? null,
        booleans?.is_field_agent ?? null,
        agentTypeChanging,
        newAgentType,
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
    const isTelecallerType =
      userRows[0].designation === "telecaller" || userRows[0].agent_type === "telecaller";
    if (!isTelecallerType) {
      throw new HttpError(
        400,
        "Only telecallers (or branch managers/team leaders with telecaller-type work) can have multiple branches assigned",
      );
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

// Assign teams to telecaller-type work (replace-set, mirrors PUT /:id/branches
// above). Covers plain telecallers and branch_manager/team_leader rows with
// agent_type = 'telecaller' -- their work is remote calling, not tied to one
// team, same reasoning as multi-branch.
router.put(
  "/:id/teams",
  requirePermission("employees.update"),
  asyncHandler(async (req, res) => {
    const body = z.object({ team_ids: z.array(z.string().uuid()) }).parse(req.body);

    const { rows: userRows } = await pool.query<UserRow>(
      "SELECT * FROM users WHERE id = $1 AND agency_id = $2",
      [req.params.id, req.user!.agency_id],
    );
    if (!userRows[0]) throw new HttpError(404, "Employee not found");
    const isTelecallerType =
      userRows[0].designation === "telecaller" || userRows[0].agent_type === "telecaller";
    if (!isTelecallerType) {
      throw new HttpError(
        400,
        "Only telecallers (or branch managers/team leaders with telecaller-type work) can have multiple teams assigned",
      );
    }

    // Validate all teams belong to this agency
    if (body.team_ids.length > 0) {
      const { rows: teams } = await pool.query(
        `SELECT t.id FROM teams t JOIN branches b ON b.id = t.branch_id
          WHERE t.id = ANY($1::uuid[]) AND b.agency_id = $2`,
        [body.team_ids, req.user!.agency_id],
      );
      if (teams.length !== body.team_ids.length) {
        throw new HttpError(400, "One or more teams not found in this agency");
      }
    }

    // Replace telecaller_teams entries
    await pool.query("DELETE FROM telecaller_teams WHERE user_id = $1", [req.params.id]);
    if (body.team_ids.length > 0) {
      await pool.query(
        "INSERT INTO telecaller_teams (user_id, team_id) SELECT $1, unnest($2::uuid[])",
        [req.params.id, body.team_ids],
      );
    }

    res.json({ success: true });
  }),
);

export default router;
