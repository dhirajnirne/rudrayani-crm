import {
  Button,
  Card,
  Col,
  DatePicker,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import BreakdownTable from "../components/dashboard/BreakdownTable";
import BucketMismatchCard from "../components/dashboard/BucketMismatchCard";
import BucketMovementCard from "../components/dashboard/BucketMovementCard";
import MetricPanel from "../components/dashboard/MetricPanel";
import MetricTabsCard from "../components/dashboard/MetricTabsCard";
import DepositsRangeCard from "../components/dashboard/DepositsRangeCard";
import OverviewChart from "../components/dashboard/OverviewChart";
import RecalledStatTile from "../components/dashboard/RecalledStatTile";
import TrailAnalyticsCard from "../components/dashboard/TrailAnalyticsCard";
import { lakh, compactCount, pctText } from "../components/dashboard/format";
import {
  METRIC_TITLES,
  type DashboardData,
  type DashboardFilters,
  type MetricKey,
} from "../components/dashboard/types";

const ALL = "__all__";

function SummaryStat({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent?: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        background: "var(--stat-bg, #f0f7f6)",
        borderRadius: 8,
        padding: "12px 16px",
        borderLeft: `3px solid ${accent ?? "#00535b"}`,
      }}
    >
      <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </Typography.Text>
      <div className="money" style={{ fontSize: 22, fontWeight: 700, color: "#00535b", lineHeight: 1.2, marginTop: 2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

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
  const otherMetrics = (Object.keys(METRIC_TITLES) as MetricKey[]).filter(
    (k) => k !== activeMetric,
  );

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
          {/* Collection hero strip */}
          <Card
            size="small"
            style={{ borderTop: "3px solid #00535b", borderRadius: 8 }}
            bodyStyle={{ padding: "12px 16px" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#00535b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Collection
              </span>
              <Tag color="cyan" style={{ fontSize: 11 }}>{data.days.elapsed}d elapsed · {data.days.left}d left</Tag>
            </div>
            <Row gutter={[12, 12]}>
              <Col xs={12} md={6}>
                <SummaryStat
                  label="Collection MTD"
                  value={lakh(data.collection.mtd_amount)}
                  accent="#00535b"
                  sub={`Run rate: ${data.collection.run_rate_current != null ? lakh(data.collection.run_rate_current) + "/day" : "—"}`}
                />
              </Col>
              <Col xs={12} md={6}>
                <SummaryStat
                  label="Collection Target"
                  value={data.collection.target_amount != null ? lakh(data.collection.target_amount) : "—"}
                  accent="#1677ff"
                />
              </Col>
              <Col xs={12} md={6}>
                <SummaryStat
                  label="Target Achieved"
                  value={pctText(data.collection.target_pct)}
                  accent={
                    data.collection.target_pct != null && data.collection.target_pct >= 80
                      ? "#52c41a"
                      : "#faad14"
                  }
                />
              </Col>
              <Col xs={12} md={6}>
                <SummaryStat
                  label="Required / Day"
                  value={data.collection.run_rate_required != null ? lakh(data.collection.run_rate_required) : "On target"}
                  accent="#ff7a45"
                />
              </Col>
            </Row>
          </Card>

          {/* Gauge + active metric panel */}
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={11}>
              <MetricTabsCard
                metrics={data.metrics}
                amountMode={amountMode}
                active={activeMetric}
                onChange={setActiveMetric}
              />
            </Col>
            <Col xs={24} lg={13}>
              <MetricPanel
                title={METRIC_TITLES[activeMetric]}
                metric={data.metrics[activeMetric]}
                amountMode={amountMode}
              />
            </Col>
          </Row>

          {/* Remaining metric cards (blueprint row 2) */}
          <Row gutter={[16, 16]}>
            {otherMetrics.map((key) => (
              <Col xs={24} md={8} key={key}>
                <MetricPanel
                  title={METRIC_TITLES[key]}
                  metric={data.metrics[key]}
                  amountMode={amountMode}
                  compact
                />
              </Col>
            ))}
          </Row>

          {/* Deposited + Trail */}
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Card size="small" title="Deposits (This Month)" style={{ height: "100%" }}>
                <Row gutter={[10, 10]}>
                  <Col span={8}>
                    <SummaryStat label="Collected" value={lakh(data.deposits.collected)} accent="#00535b" />
                  </Col>
                  <Col span={8}>
                    <SummaryStat label="Deposited" value={lakh(data.deposits.deposited)} accent="#1677ff" />
                  </Col>
                  <Col span={8}>
                    <SummaryStat label="Pending" value={lakh(data.deposits.pending)} accent="#faad14" />
                  </Col>
                </Row>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <DepositsRangeCard filters={filters} />
            </Col>
            <Col xs={24} md={8}>
              <Card size="small" title="Trail Activity" style={{ height: "100%" }}>
                <Row gutter={[10, 10]}>
                  <Col span={8}>
                    <SummaryStat
                      label="Allocated"
                      value={compactCount(data.trail.allocated_count)}
                      accent="#722ed1"
                    />
                  </Col>
                  <Col span={8}>
                    <SummaryStat
                      label="Trailed"
                      value={compactCount(data.trail.uploaded_count)}
                      accent="#13c2c2"
                    />
                  </Col>
                  <Col span={8}>
                    <SummaryStat label="Trail %" value={pctText(data.trail.pct)} accent="#eb2f96" />
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>

          {/* Recalled cases + bucket movements (Phase 7) */}
          <Row gutter={[16, 16]}>
            <Col xs={24} md={6}>
              <RecalledStatTile filters={filters} />
            </Col>
            <Col xs={24} md={18}>
              <BucketMovementCard filters={filters} />
            </Col>
          </Row>

          {/* DPD cross-check (Phase 7 correction) */}
          <BucketMismatchCard filters={filters} />

          {/* Dimension breakdown ("product wise view" and every other cut) */}
          <BreakdownTable filters={filters} />

          {/* Trail / disposition analytics */}
          <TrailAnalyticsCard filters={filters} />

          {/* Monthly overview chart */}
          <OverviewChart filters={filters} />
        </Space>
      )}
    </div>
  );
}
