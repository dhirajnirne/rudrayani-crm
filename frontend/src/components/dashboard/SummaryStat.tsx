import { Typography } from "antd";
import { palette } from "../../theme/tokens";

/** Shared small stat tile used across dashboard cards and widgets. */
export default function SummaryStat({
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
        background: palette.background,
        borderRadius: 8,
        padding: "12px 16px",
        borderLeft: `3px solid ${accent ?? palette.navy}`,
      }}
    >
      <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </Typography.Text>
      <div className="money" style={{ fontSize: 22, fontWeight: 700, color: palette.navy, lineHeight: 1.2, marginTop: 2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: palette.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
