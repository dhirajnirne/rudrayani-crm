import { Tabs, Typography } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import Gauge from "./Gauge";
import { lakh, compactCount, metricValue, pctText } from "./format";
import { METRIC_TITLES, type MetricBlock, type MetricKey } from "./types";

/**
 * The blueprint's dark card: Resolution / Rollback / Normalization / Recovery
 * tabs, each with the MTD-vs-target gauge and the "you are X away" note.
 */
export default function MetricTabsCard({
  metrics,
  amountMode,
  active,
  onChange,
}: {
  metrics: Record<MetricKey, MetricBlock>;
  amountMode: boolean;
  active: MetricKey;
  onChange: (key: MetricKey) => void;
}) {
  const metric = metrics[active];
  const away = amountMode ? metric.away_amount : metric.away_count;

  return (
    <div
      style={{
        background: "linear-gradient(160deg, #00423f 0%, #01302e 100%)",
        borderRadius: 12,
        padding: "8px 16px 16px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Tabs
        activeKey={active}
        onChange={(k) => onChange(k as MetricKey)}
        items={(Object.keys(METRIC_TITLES) as MetricKey[]).map((key) => ({
          key,
          label: (
            <span style={{ color: key === active ? "#35d431" : "rgba(255,255,255,0.85)" }}>
              {METRIC_TITLES[key]}
            </span>
          ),
        }))}
        tabBarStyle={{ marginBottom: 4 }}
      />
      <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "8px 0" }}>
        <Gauge
          value={amountMode ? metric.mtd_amount : metric.mtd_count}
          target={amountMode ? metric.target_amount : metric.target_count}
          valueText={metricValue(amountMode, metric.mtd_amount, metric.mtd_count)}
          targetText={
            amountMode
              ? metric.target_amount != null
                ? lakh(metric.target_amount)
                : "No target"
              : metric.target_count != null
                ? compactCount(metric.target_count)
                : "No target"
          }
          pctText={pctText(metric.mtd_pct)}
        />
      </div>
      <div
        style={{
          background: "rgba(53,212,49,0.12)",
          borderRadius: 8,
          padding: "8px 12px",
        }}
      >
        <Typography.Text style={{ color: "#e8ffe6", fontSize: 13 }}>
          <InfoCircleOutlined />{" "}
          {away != null ? (
            <>
              You are{" "}
              <b className="money">{amountMode ? lakh(away) : compactCount(away)}</b> away from
              achieving your target.
            </>
          ) : (
            <>No {METRIC_TITLES[active].toLowerCase()} target set for this month.</>
          )}
        </Typography.Text>
      </div>
    </div>
  );
}
