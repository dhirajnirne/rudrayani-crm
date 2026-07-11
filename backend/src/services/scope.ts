/**
 * Visibility scope (brief Section 3): Agency Admin / Ops Manager see the
 * whole agency; a Team Leader sees their own team. Returns SQL filter parts
 * to AND onto a query already filtered by agency_id — callers substitute the
 * `$SCOPE` placeholder for the next positional parameter.
 *
 * Phase 12: telecaller/field_agent now also hold tracking.view (self only —
 * their mobile dashboards need their own attendance/GPS/route), so instead of
 * failing shut for "neither admin/ops nor TL" this falls back to a self-only
 * clause (`u.id = $SCOPE`) rather than a 403. Nothing about the admin/ops/TL
 * branches above changes.
 */
export function scopeFilter(user: {
  id: string;
  is_agency_admin: boolean;
  is_operations_manager: boolean;
  is_team_leader: boolean;
  team_id: string | null;
}): { clause: string; param: string | null } {
  if (user.is_agency_admin || user.is_operations_manager) {
    return { clause: "", param: null };
  }
  if (user.is_team_leader) {
    // TL without a team assigned sees nothing rather than everything.
    return {
      clause: "AND u.team_id = $SCOPE",
      param: user.team_id ?? "00000000-0000-0000-0000-000000000000",
    };
  }
  return { clause: "AND u.id = $SCOPE", param: user.id };
}
