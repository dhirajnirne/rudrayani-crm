import { Router } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate, requirePermission } from "../middleware/authenticate";
import { HttpError } from "../middleware/error-handler";

const router = Router();
router.use(authenticate);

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  branch_id: z.string().uuid(),
});

async function assertBranchInAgency(branchId: string, agencyId: string): Promise<void> {
  const { rows } = await pool.query("SELECT 1 FROM branches WHERE id = $1 AND agency_id = $2", [
    branchId,
    agencyId,
  ]);
  if (rows.length === 0) throw new HttpError(400, "Branch not found in this agency");
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const branchId = req.query.branch_id as string | undefined;
    const { rows: teams } = await pool.query(
      `SELECT t.id, t.name, t.branch_id, b.name AS branch_name, t.created_at
         FROM teams t
         JOIN branches b ON b.id = t.branch_id
        WHERE b.agency_id = $1 AND ($2::uuid IS NULL OR t.branch_id = $2)
        ORDER BY b.name, t.name`,
      [req.user!.agency_id, branchId ?? null],
    );

    // Fetch leaders for each team
    const { rows: allLeaders } = await pool.query(
      `SELECT tl.team_id, u.id, u.full_name FROM team_leaders tl
         JOIN users u ON u.id = tl.user_id
        ORDER BY tl.team_id, u.full_name`,
    );
    const leadersByTeam = new Map<string, Array<{ id: string; full_name: string }>>();
    for (const leader of allLeaders) {
      if (!leadersByTeam.has(leader.team_id)) leadersByTeam.set(leader.team_id, []);
      leadersByTeam.get(leader.team_id)!.push({ id: leader.id, full_name: leader.full_name });
    }

    res.json({
      teams: teams.map((t) => ({
        ...t,
        leaders: leadersByTeam.get(t.id) ?? [],
      })),
    });
  }),
);

router.post(
  "/",
  requirePermission("teams.manage"),
  asyncHandler(async (req, res) => {
    const body = bodySchema.parse(req.body);
    await assertBranchInAgency(body.branch_id, req.user!.agency_id);
    const { rows } = await pool.query(
      "INSERT INTO teams (branch_id, name) VALUES ($1, $2) RETURNING id, name, branch_id, created_at",
      [body.branch_id, body.name],
    );
    res.status(201).json({ team: rows[0] });
  }),
);

router.patch(
  "/:id",
  requirePermission("teams.manage"),
  asyncHandler(async (req, res) => {
    const body = bodySchema.partial().parse(req.body);
    if (body.branch_id) await assertBranchInAgency(body.branch_id, req.user!.agency_id);
    const { rows } = await pool.query(
      `UPDATE teams t SET
          name = COALESCE($3, t.name),
          branch_id = COALESCE($4, t.branch_id)
        FROM branches b
       WHERE t.id = $1 AND b.id = t.branch_id AND b.agency_id = $2
       RETURNING t.id, t.name, t.branch_id, t.created_at`,
      [req.params.id, req.user!.agency_id, body.name ?? null, body.branch_id ?? null],
    );
    if (!rows[0]) throw new HttpError(404, "Team not found");
    res.json({ team: rows[0] });
  }),
);

// Add a team leader (Admin/OM only, not broader teams.manage)
router.post(
  "/:id/leaders",
  asyncHandler(async (req, res) => {
    // Gate by ops_managers.create so only Admin/OM can assign leadership
    const allowed = await requirePermission("ops_managers.create")(req, res, () => {});
    if (allowed instanceof HttpError) throw allowed;

    const body = z.object({ user_id: z.string().uuid() }).parse(req.body);

    // Verify team exists and belongs to agency
    const { rows: teamRows } = await pool.query(
      `SELECT t.id FROM teams t JOIN branches b ON b.id = t.branch_id
        WHERE t.id = $1 AND b.agency_id = $2`,
      [req.params.id, req.user!.agency_id],
    );
    if (!teamRows[0]) throw new HttpError(404, "Team not found");

    // Verify user is a team_leader designation in same agency
    const { rows: userRows } = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND agency_id = $2 AND designation = 'team_leader'`,
      [body.user_id, req.user!.agency_id],
    );
    if (!userRows[0]) throw new HttpError(400, "User not found or is not a team leader");

    // Add to team_leaders
    await pool.query(
      `INSERT INTO team_leaders (user_id, team_id) VALUES ($1, $2)
         ON CONFLICT (user_id, team_id) DO NOTHING`,
      [body.user_id, req.params.id],
    );

    res.status(201).json({ success: true });
  }),
);

// Remove a team leader
router.delete(
  "/:id/leaders/:userId",
  asyncHandler(async (req, res) => {
    // Gate by ops_managers.create so only Admin/OM can manage leadership
    const allowed = await requirePermission("ops_managers.create")(req, res, () => {});
    if (allowed instanceof HttpError) throw allowed;

    // Verify team exists and belongs to agency
    const { rows: teamRows } = await pool.query(
      `SELECT t.id FROM teams t JOIN branches b ON b.id = t.branch_id
        WHERE t.id = $1 AND b.agency_id = $2`,
      [req.params.id, req.user!.agency_id],
    );
    if (!teamRows[0]) throw new HttpError(404, "Team not found");

    // Remove from team_leaders
    await pool.query(`DELETE FROM team_leaders WHERE user_id = $1 AND team_id = $2`, [
      req.params.userId,
      req.params.id,
    ]);

    res.json({ success: true });
  }),
);

export default router;
