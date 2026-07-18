import { Button, Card, Empty, Space, Spin, Tag, Tree, Typography, message } from "antd";
import type { DataNode } from "antd/es/tree";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../api/client";
import AgentDetailDrawer from "../components/AgentDetailDrawer";
import BranchDetailDrawer from "../components/BranchDetailDrawer";
import TeamDetailDrawer from "../components/TeamDetailDrawer";
import { lakh, pctText } from "../components/dashboard/format";
import { CAPABILITY_LABELS, type OrgAgent, type OrgHierarchy } from "../types";

/**
 * Builds a forest from a flat agent list using manager_id edges. An agent
 * whose manager isn't present in this same list (different team/branch, or
 * no manager at all) becomes a root -- manager_id is informational only
 * (brief §3), so it can legitimately point outside the current grouping.
 */
function buildForest(agents: OrgAgent[]): (OrgAgent & { children: OrgAgent[] })[] {
  const byId = new Map<string, OrgAgent & { children: OrgAgent[] }>(
    agents.map((a) => [a.id, { ...a, children: [] }]),
  );
  const roots: (OrgAgent & { children: OrgAgent[] })[] = [];
  for (const node of byId.values()) {
    const parent = node.manager_id ? byId.get(node.manager_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function agentTitle(agent: OrgAgent, managerInGroup: boolean) {
  return (
    <Space size={6} wrap>
      <Typography.Text strong>{agent.full_name}</Typography.Text>
      {agent.capabilities.map((c) => (
        <Tag color={c === "agency_admin" ? "gold" : "blue"} key={c}>
          {CAPABILITY_LABELS[c]}
        </Tag>
      ))}
      {!agent.is_active && <Tag color="red">Deactivated</Tag>}
      {agent.performance && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {lakh(agent.performance.collected_amount)} collected · {pctText(agent.performance.achievement_pct)}
        </Typography.Text>
      )}
      {agent.manager_name && !managerInGroup && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          reports to {agent.manager_name}
        </Typography.Text>
      )}
    </Space>
  );
}

function toTreeData(
  nodes: (OrgAgent & { children: OrgAgent[] })[],
  groupIds: Set<string>,
): DataNode[] {
  return nodes.map((n) => ({
    key: n.id,
    title: agentTitle(n, groupIds.has(n.manager_id ?? "")),
    children: n.children.length
      ? toTreeData(n.children as (OrgAgent & { children: OrgAgent[] })[], groupIds)
      : undefined,
  }));
}

function AgentForest({ agents, onSelectAgent }: { agents: OrgAgent[]; onSelectAgent: (agent: OrgAgent) => void }) {
  if (agents.length === 0) return <Empty description="No employees" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  const groupIds = new Set(agents.map((a) => a.id));
  const forest = buildForest(agents);
  const byId = new Map(agents.map((a) => [a.id, a]));
  return (
    <Tree
      treeData={toTreeData(forest, groupIds)}
      defaultExpandAll
      selectable
      showLine
      onSelect={(keys) => {
        const agent = keys[0] ? byId.get(String(keys[0])) : undefined;
        if (agent) onSelectAgent(agent);
      }}
    />
  );
}

export default function OrgChartPage() {
  const [data, setData] = useState<OrgHierarchy | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchDrawerId, setBranchDrawerId] = useState<string | null>(null);
  const [teamDrawer, setTeamDrawer] = useState<{ id: string; name: string } | null>(null);
  const [agentDrawer, setAgentDrawer] = useState<{ id: string; name: string } | null>(null);

  const month = useMemo(() => new Date().toISOString().slice(0, 7), []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<OrgHierarchy>("/employees/org-hierarchy", {
          params: { with_performance: "true", month },
        });
        setData(res.data);
      } catch (err) {
        message.error(errorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [month]);

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: 320 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <Typography.Title level={3} style={{ marginBottom: 4 }}>
        Org Chart
      </Typography.Title>
      <Typography.Text type="secondary">
        {data.agency?.name ?? "Agency"} — click a branch, team, or agent for performance and recent
        activity.
      </Typography.Text>

      <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
        {data.branches.map((branch) => (
          <Card
            key={branch.id}
            title={
              <Space wrap>
                <Button type="link" style={{ padding: 0, fontWeight: "bold" }} onClick={() => setBranchDrawerId(branch.id)}>
                  {branch.name}
                </Button>
                {branch.branch_manager ? (
                  <Tag color="purple">Manager: {branch.branch_manager.full_name}</Tag>
                ) : (
                  <Tag color="default">No manager assigned</Tag>
                )}
                {branch.performance && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {lakh(branch.performance.collected_amount)} collected ·{" "}
                    {pctText(branch.performance.achievement_pct)}
                  </Typography.Text>
                )}
              </Space>
            }
          >
            <div style={{ display: "grid", gap: 16 }}>
              {branch.teams.map((team) => (
                <div key={team.id}>
                  <Space wrap>
                    <Button
                      type="link"
                      style={{ padding: 0, fontWeight: "bold" }}
                      onClick={() => setTeamDrawer({ id: team.id, name: team.name })}
                    >
                      {team.name}
                    </Button>
                    {team.performance && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {lakh(team.performance.collected_amount)} collected ·{" "}
                        {pctText(team.performance.achievement_pct)}
                      </Typography.Text>
                    )}
                  </Space>
                  <div style={{ marginTop: 8 }}>
                    <AgentForest
                      agents={team.agents}
                      onSelectAgent={(agent) => setAgentDrawer({ id: agent.id, name: agent.full_name })}
                    />
                  </div>
                </div>
              ))}
              {branch.unassigned_agents.length > 0 && (
                <div>
                  <Typography.Text strong>Unassigned (no team)</Typography.Text>
                  <div style={{ marginTop: 8 }}>
                    <AgentForest
                      agents={branch.unassigned_agents}
                      onSelectAgent={(agent) => setAgentDrawer({ id: agent.id, name: agent.full_name })}
                    />
                  </div>
                </div>
              )}
              {branch.teams.length === 0 && branch.unassigned_agents.length === 0 && (
                <Empty description="No employees in this branch" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              )}
            </div>
          </Card>
        ))}

        {data.unassigned_agents.length > 0 && (
          <Card title="Unassigned (no branch)">
            <AgentForest
              agents={data.unassigned_agents}
              onSelectAgent={(agent) => setAgentDrawer({ id: agent.id, name: agent.full_name })}
            />
          </Card>
        )}

        {data.branches.length === 0 && data.unassigned_agents.length === 0 && (
          <Empty description="No employees yet" />
        )}
      </div>

      <BranchDetailDrawer branchId={branchDrawerId} open={branchDrawerId !== null} onClose={() => setBranchDrawerId(null)} />
      <TeamDetailDrawer
        teamId={teamDrawer?.id ?? null}
        teamName={teamDrawer?.name}
        month={month}
        open={teamDrawer !== null}
        onClose={() => setTeamDrawer(null)}
      />
      <AgentDetailDrawer
        agentId={agentDrawer?.id ?? null}
        agentName={agentDrawer?.name}
        month={month}
        open={agentDrawer !== null}
        onClose={() => setAgentDrawer(null)}
      />
    </div>
  );
}
