import { Card, Empty, Space, Spin, Tag, Tree, Typography, message } from "antd";
import type { DataNode } from "antd/es/tree";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";
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

function AgentForest({ agents }: { agents: OrgAgent[] }) {
  if (agents.length === 0) return <Empty description="No employees" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  const groupIds = new Set(agents.map((a) => a.id));
  const forest = buildForest(agents);
  return (
    <Tree
      treeData={toTreeData(forest, groupIds)}
      defaultExpandAll
      selectable={false}
      showLine
    />
  );
}

export default function OrgChartPage() {
  const [data, setData] = useState<OrgHierarchy | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<OrgHierarchy>("/employees/org-hierarchy");
        setData(res.data);
      } catch (err) {
        message.error(errorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
        {data.agency?.name ?? "Agency"} — branch → team → reporting lines (via "Reports to" on each
        employee)
      </Typography.Text>

      <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
        {data.branches.map((branch) => (
          <Card key={branch.id} title={branch.name}>
            <div style={{ display: "grid", gap: 16 }}>
              {branch.teams.map((team) => (
                <div key={team.id}>
                  <Typography.Text strong>{team.name}</Typography.Text>
                  <div style={{ marginTop: 8 }}>
                    <AgentForest agents={team.agents} />
                  </div>
                </div>
              ))}
              {branch.unassigned_agents.length > 0 && (
                <div>
                  <Typography.Text strong>Unassigned (no team)</Typography.Text>
                  <div style={{ marginTop: 8 }}>
                    <AgentForest agents={branch.unassigned_agents} />
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
            <AgentForest agents={data.unassigned_agents} />
          </Card>
        )}

        {data.branches.length === 0 && data.unassigned_agents.length === 0 && (
          <Empty description="No employees yet" />
        )}
      </div>
    </div>
  );
}
