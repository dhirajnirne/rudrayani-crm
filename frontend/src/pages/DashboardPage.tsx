import {
  Button,
  DatePicker,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import { DownloadOutlined, SettingOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import DashboardCustomizer from "../components/dashboard/DashboardCustomizer";
import { applyLayout, type DashboardRenderCtx } from "../components/dashboard/widgetRegistry";
import { useDashboardPreferences } from "../hooks/useDashboardPreferences";
import {
  type DashboardData,
  type DashboardFilters,
  type MetricKey,
} from "../components/dashboard/types";

const ALL = "__all__";

/**
 * Performance dashboard (Phase 5, per the blueprint in "web dashboard view"):
 * product tabs, granular filters, Amount/Count toggle, metric gauge + cards,
 * deposited/trail cards, monthly overview chart, filtered Excel export.
 * The same page serves every role — the server clamps the scope (admin/ops
 * agency-wide, TL own team, agents self-only with filters hidden).
 */
export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const isManager = hasPermission("reports.view");

  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [companyId, setCompanyId] = useState<string>();
  const [branchId, setBranchId] = useState<string>();
  const [teamId, setTeamId] = useState<string>();
  const [agentId, setAgentId] = useState<string>();
  const [product, setProduct] = useState<string>();
  const [bucket, setBucket] = useState<string>();
  const [status, setStatus] = useState<"active" | "closed" | "recalled">();
  const [amountMode, setAmountMode] = useState(true);
  const [activeMetric, setActiveMetric] = useState<MetricKey>("resolution");

  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([]);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [customizerOpen, setCustomizerOpen] = useState(false);

  const prefs = useDashboardPreferences();

  useEffect(() => {
    if (!isManager) return;
    api.get("/companies").then((r) => setCompanies(r.data.companies));
    api.get("/branches").then((r) => setBranches(r.data.branches));
    api.get("/teams").then((r) => setTeams(r.data.teams));
    if (hasPermission("employees.view")) {
      api
        .get("/employees")
        .then((r) =>
          setAgents(
            r.data.employees.filter(
              (e: { is_active: boolean; is_telecaller: boolean; is_field_agent: boolean }) =>
                e.is_active && (e.is_telecaller || e.is_field_agent),
            ),
          ),
        );
    }
  }, [isManager, hasPermission]);

  const filters: DashboardFilters = useMemo(
    () => ({
      month: month.format("YYYY-MM"),
      company_id: companyId,
      branch_id: branchId,
      team_id: teamId,
      agent_id: agentId,
      product,
      bucket,
      status,
    }),
    [month, companyId, branchId, teamId, agentId, product, bucket, status],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { month: filters.month };
      for (const key of ["company_id", "branch_id", "team_id", "agent_id", "product", "bucket", "status"] as const) {
        if (filters[key]) params[key] = filters[key]!;
      }
      const res = await api.get("/reports/dashboard", { params });
      setData(res.data);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const params: Record<string, string> = { month: filters.month };
      for (const key of ["company_id", "branch_id", "team_id", "agent_id", "product", "bucket", "status"] as const) {
        if (filters[key]) params[key] = filters[key]!;
      }
      const res = await api.get("/reports/export", { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dashboard-${filters.month}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const products = data?.filters.products ?? [];
  const buckets = data?.filters.buckets ?? [];

  return (
    <div>
      {/* Product tabs (blueprint top row) */}
      <Tabs
        activeKey={product ?? ALL}
        onChange={(k) => setProduct(k === ALL ? undefined : k)}
        items={[
          { key: ALL, label: "All Products" },
          ...products.map((p) => ({ key: p, label: p })),
        ]}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Typography.Title level={4} style={{ margin: 0 }}>
          {isManager ? "Performance Dashboard" : `My Performance — ${user?.full_name}`} (
          {month.format("MMM YYYY")})
        </Typography.Title>
        <Space wrap>
          {data && (
            <Tag color={data.days.left > 0 ? "green" : "default"} style={{ fontWeight: 600 }}>
              {data.days.left} Days Left
            </Tag>
          )}
          <Space size={6}>
            <Typography.Text type="secondary">Count</Typography.Text>
            <Switch checked={amountMode} onChange={setAmountMode} />
            <Typography.Text type="secondary">Amount</Typography.Text>
          </Space>
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={exportExcel}>
            Export
          </Button>
          <Button icon={<SettingOutlined />} onClick={() => setCustomizerOpen(true)}>
            Customize
          </Button>
        </Space>
      </div>

      {/* Filter bar — Company first, then month, then scope narrowers */}
      <Space wrap style={{ marginBottom: 16 }}>
        {isManager && (
          <Select
            style={{ width: 200 }}
            placeholder="All companies"
            allowClear
            value={companyId}
            onChange={(v) => setCompanyId(v ?? undefined)}
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
        <DatePicker
          picker="month"
          allowClear={false}
          value={month}
          onChange={(m) => m && setMonth(m)}
        />
        <Select
          style={{ width: 170 }}
          placeholder="All Buckets"
          allowClear
          value={bucket}
          onChange={setBucket}
          options={buckets.map((b) => ({ value: b, label: b }))}
        />
        <Select
          style={{ width: 150 }}
          placeholder="All Statuses"
          allowClear
          value={status}
          onChange={(v) => setStatus(v ?? undefined)}
          options={[
            { value: "active", label: "Active" },
            { value: "recalled", label: "Recalled" },
            { value: "closed", label: "Closed" },
          ]}
        />
        {isManager && (
          <>
            {data?.scope.clamped_to === "agency" && (
              <>
                <Select
                  style={{ width: 170 }}
                  placeholder="All branches"
                  allowClear
                  value={branchId}
                  onChange={(v) => {
                    setBranchId(v ?? undefined);
                    setTeamId(undefined);
                    setAgentId(undefined);
                  }}
                  options={branches.map((b) => ({ value: b.id, label: b.name }))}
                />
                <Select
                  style={{ width: 170 }}
                  placeholder="All teams"
                  allowClear
                  value={teamId}
                  onChange={(v) => {
                    setTeamId(v ?? undefined);
                    setAgentId(undefined);
                  }}
                  options={teams.map((t) => ({ value: t.id, label: t.name }))}
                />
              </>
            )}
            <Select
              style={{ width: 190 }}
              placeholder="All agents"
              allowClear
              showSearch
              optionFilterProp="label"
              value={agentId}
              onChange={(v) => setAgentId(v ?? undefined)}
              options={agents.map((a) => ({ value: a.id, label: a.full_name }))}
            />
          </>
        )}
      </Space>

      {loading || !data ? (
        <div style={{ display: "grid", placeItems: "center", height: 320 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Space direction="vertical" size={16} style={{ width: "100%", display: "flex" }}>
          {(() => {
            const ctx: DashboardRenderCtx = { data, filters, amountMode, activeMetric, setActiveMetric };
            return applyLayout(prefs.layout, isManager).map((w) => (
              <div key={w.id}>{w.render(ctx)}</div>
            ));
          })()}
        </Space>
      )}

      <DashboardCustomizer
        open={customizerOpen}
        onClose={() => setCustomizerOpen(false)}
        layout={prefs.layout}
        isManager={isManager}
        onSave={prefs.save}
        onReset={prefs.reset}
      />
    </div>
  );
}
