import { Card, Col, Row, Tooltip, Typography } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import { lakh, metricValue, pctText } from "./format";
import type { MetricBlock } from "./types";

function Stat({ label, value, info }: { label: string; value: string; info?: string }) {
  return (
    <div
      style={{
        background: "#f7f8f7",
        borderRadius: 8,
        padding: "10px 14px",
        height: "100%",
      }}
    >
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {label}
        {info && (
          <Tooltip title={info}>
            {" "}
            <InfoCircleOutlined style={{ fontSize: 12 }} />
          </Tooltip>
        )}
      </Typography.Text>
      <div className="money" style={{ fontSize: 20, fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
}

/**
 * The blueprint's right-hand metric card: Allocated Amount, Target /
 * Target %, MTD / MTD %, and the Daily Run Rate row.
 */
export default function MetricPanel({
  title,
  metric,
  amountMode,
  compact = false,
}: {
  title: string;
  metric: MetricBlock;
  amountMode: boolean;
  compact?: boolean;
}) {
  const basisInfo =
    metric.basis === "transition"
      ? "Computed from bucket movement against next month's allocation file."
      : "Live estimate from this month's payments (next month's allocation file not imported yet).";

  return (
    <Card
      size={compact ? "small" : "default"}
      title={
        <span>
          {title} Metrics{" "}
          <Tooltip title={basisInfo}>
            <InfoCircleOutlined style={{ fontSize: 13, color: "#999" }} />
          </Tooltip>
        </span>
      }
      style={{ height: "100%" }}
    >
      <Row gutter={[10, 10]}>
        <Col span={24}>
          <Stat
            label="Allocated Amount"
            value={metricValue(amountMode, metric.allocated_amount, metric.allocated_count)}
          />
        </Col>
        <Col span={12}>
          <Stat
            label={`${title} Target`}
            value={metricValue(amountMode, metric.target_amount, metric.target_count)}
          />
        </Col>
        <Col span={12}>
          <Stat label={`${title} Target (%)`} value={pctText(metric.target_pct)} />
        </Col>
        <Col span={12}>
          <Stat
            label={`${title} MTD`}
            value={metricValue(amountMode, metric.mtd_amount, metric.mtd_count)}
          />
        </Col>
        <Col span={12}>
          <Stat label={`${title} MTD (%)`} value={pctText(metric.mtd_pct)} />
        </Col>
      </Row>
      {!compact && (
        <>
          <Typography.Title level={5} style={{ marginTop: 16, marginBottom: 8 }}>
            Daily Run Rate
          </Typography.Title>
          <Row gutter={[10, 10]}>
            <Col span={12}>
              <Stat
                label="Current"
                value={metric.run_rate_current != null ? lakh(metric.run_rate_current) : "NA"}
                info="MTD achieved divided by days elapsed"
              />
            </Col>
            <Col span={12}>
              <Stat
                label="Required"
                value={metric.run_rate_required != null ? lakh(metric.run_rate_required) : "NA"}
                info="Remaining target divided by days left in the month"
              />
            </Col>
          </Row>
        </>
      )}
    </Card>
  );
}
