import { pool } from "../config/db";

/**
 * Visibility scope (brief Section 3): Agency Admin / Ops Manager see the
 * whole agency; a Branch Manager sees their whole branch (every team in it,
 * directly -- no team_leader intermediary since Phase 2). Returns SQL
 * filter parts to AND onto a query already filtered by agency_id --
 * callers substitute the `$SCOPE` placeholder for the next positional
 * parameter.
 *
 * Phase 12: telecaller/field_agent now also hold tracking.view (self only —
 * their mobile dashboards need their own attendance/GPS/route), so instead of
 * failing shut for "neither admin/ops nor branch_manager" this falls back to
 * a self-only clause (`u.id = $SCOPE`) rather than a 403.
 *
 * branch_manager: sees everyone whose scalar branch_id matches the branch
 * they manage (branches.branch_manager_id), PLUS any telecaller assigned to
 * that branch via the telecaller_branches junction table even if that
 * telecaller's own scalar branch_id points elsewhere -- this is what keeps a
 * multi-branch telecaller visible to every branch manager who has them
 * assigned, not just the one matching their scalar branch_id.
 */
export async function scopeFilter(user: {
  id: string;
  is_agency_admin: boolean;
  is_operations_manager: boolean;
  team_id: string | null;
  designation?: string;
}): Promise<{ clause: string; param: string | string[] | null }> {
  if (user.is_agency_admin || user.is_operations_manager) {
    return { clause: "", param: null };
  }
  if (user.designation === "branch_manager") {
    const { rows } = await pool.query<{ id: string }>(
      "SELECT id FROM branches WHERE branch_manager_id = $1",
      [user.id],
    );
    const branchId = rows[0]?.id;
    if (!branchId) {
      // Not yet assigned to a branch -> sees nothing.
      return { clause: "AND u.branch_id = $SCOPE", param: "00000000-0000-0000-0000-000000000000" };
    }
    return {
      clause:
        "AND (u.branch_id = $SCOPE OR EXISTS (SELECT 1 FROM telecaller_branches tb WHERE tb.user_id = u.id AND tb.branch_id = $SCOPE))",
      param: branchId,
    };
  }
  return { clause: "AND u.id = $SCOPE", param: user.id };
}
