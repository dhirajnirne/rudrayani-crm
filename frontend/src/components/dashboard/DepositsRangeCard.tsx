import { Card, Col, DatePicker, Row, Spin, Typography, message } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../../api/client";
import { lakh } from "./format";
import { palette } from "../../theme/tokens";
import type { DashboardFilters } from "./types";

const { RangePicker } = DatePicker;

interface DepositTotals {
  collected: number;
  deposited: number;
  pending: number;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: palette.background, borderRadius: 8, padding: "10px 14px", borderLeft: `3px solid ${accent ?? palette.navy}` }}>
      <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </Typography.Text>
      <div className="money" style={{ fontSize: 20, fontWeight: 700, color: palette.navy, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

export default function DepositsRangeCard({ filters }: { filters: DashboardFilters }) {
  const monthStart = dayjs(`${filters.month}-01`);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    monthStart.startOf("month"),
    monthStart.endOf("month"),
  ]);
  const [data, setData] = useState<DepositTotals | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const [from, to] = range;
    setLoading(true);
    const params: Record<string, string> = {
      from: from.format("YYYY-MM-DD"),
      to: to.format("YYYY-MM-DD"),
    };
    if (filters.company_id) params.company_id = filters.company_id;
    if (filters.agent_id) params.agent_id = filters.agent_id;
    if (filters.team_id) params.team_id = filters.team_id;
    if (filters.branch_id) params.branch_id = filters.branch_id;
    api
      .get("/reports/deposits-range", { params })
      .then((r) => setData(r.data))
      .catch((err) => message.error(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [range, filters.company_id, filters.agent_id, filters.team_id, filters.branch_id]);

  return (
    <Card
      size="small"
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>Deposits — Custom Range</span>
          <RangePicker
            size="small"
            value={range}
            onChange={(v) => v && setRange(v as [Dayjs, Dayjs])}
            allowClear={false}
          />
        </div>
      }
      style={{ height: "100%" }}
    >
      {loading ? (
        <div style={{ display: "grid", placeItems: "center", height: 80 }}>
          <Spin size="small" />
        </div>
      ) : (
        <Row gutter={[10, 10]}>
          <Col span={8}>
            <Stat label="Collected" value={data ? lakh(data.collected) : "—"} accent={palette.navy} />
          </Col>
          <Col span={8}>
            <Stat label="Deposited" value={data ? lakh(data.deposited) : "—"} accent="#1677ff" />
          </Col>
          <Col span={8}>
            <Stat label="Pending" value={data ? lakh(data.pending) : "—"} accent="#faad14" />
          </Col>
        </Row>
      )}
    </Card>
  );
}
