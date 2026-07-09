import { HttpError } from "../middleware/error-handler";

/**
 * Visibility scope (brief Section 3): Agency Admin / Ops Manager see the
 * whole agency; a Team Leader sees their own team. Returns SQL filter parts
 * to AND onto a query already filtered by agency_id — callers substitute the
 * `$SCOPE` placeholder for the next positional parameter.
 */
export function scopeFilter(user: {
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
  throw new HttpError(403, "Only managers and team leaders can view this");
}
