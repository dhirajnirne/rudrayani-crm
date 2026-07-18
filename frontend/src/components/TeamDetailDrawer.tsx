import { Drawer } from "antd";
import BreakdownTable from "./dashboard/BreakdownTable";

/**
 * Team drill-down: reuses BreakdownTable (already powers the branch drawer's
 * "Agent-wise Breakdown" and the dashboard's own breakdown widget) scoped to
 * this team and defaulted to the agent dimension -- no bespoke roster fetch,
 * the breakdown rows already are the roster with live performance attached.
 * Used both when a branch_manager/ops/admin clicks into a team from above
 * (OrgChartPage) and when a team_leader views their own team (DashboardPage).
 */
export default function TeamDetailDrawer({
  teamId,
  teamName,
  month,
  open,
  onClose,
}: {
  teamId: string | null;
  teamName?: string;
  month: string; // YYYY-MM
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer title={teamName ?? "Team"} open={open} onClose={onClose} width={760} destroyOnHidden>
      {teamId && <BreakdownTable filters={{ month, team_id: teamId }} defaultDimension="agent" />}
    </Drawer>
  );
}
