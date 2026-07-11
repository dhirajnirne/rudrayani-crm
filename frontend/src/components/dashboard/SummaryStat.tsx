import { theme, Typography } from "antd";
import { palette } from "../../theme/tokens";

/**
 * Shared small stat tile used across dashboard cards and widgets.
 * Uses antd's resolved theme tokens (not the static `palette` import) for
 * background/text so the tile actually flips with light/dark mode -- a
 * previous version hardcoded `palette.background`/`palette.navy` (the
 * light-only palette), which left the label invisible in dark mode since
 * `Typography.Text type="secondary"` picks up the ambient (mode-aware)
 * colorTextSecondary token.
 */
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
  const { token } = theme.useToken();
  return (
    <div
      style={{
        background: token.colorFillTertiary,
        borderRadius: 8,
        padding: "12px 16px",
        borderLeft: `3px solid ${accent ?? palette.navy}`,
      }}
    >
      <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </Typography.Text>
      <div className="money" style={{ fontSize: 22, fontWeight: 700, color: token.colorText, lineHeight: 1.2, marginTop: 2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
