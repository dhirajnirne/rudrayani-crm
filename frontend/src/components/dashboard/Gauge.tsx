/**
 * Custom SVG gauge per the blueprint: solid MTD arc over a dashed target
 * track, centered value + "Your MTD (x%)", 0 and target end labels.
 * Deliberately not a chart-library gauge — the mock's dashed outer arc and
 * label layout aren't achievable with stock G2.
 */
import { palette } from "../../theme/tokens";

interface GaugeProps {
  value: number; // MTD
  target: number | null; // arc scale max; null -> no target set
  valueText: string;
  targetText: string;
  pctText: string;
}

const CX = 130;
const CY = 130;
const R = 100;
const START = Math.PI; // 180° sweep, left to right
const polar = (angle: number, r = R) => ({
  x: CX + r * Math.cos(START + angle),
  y: CY + r * Math.sin(START + angle),
});

function arcPath(fromAngle: number, toAngle: number, r = R): string {
  const from = polar(fromAngle, r);
  const to = polar(toAngle, r);
  const largeArc = toAngle - fromAngle > Math.PI ? 1 : 0;
  return `M ${from.x} ${from.y} A ${r} ${r} 0 ${largeArc} 1 ${to.x} ${to.y}`;
}

export default function Gauge({ value, target, valueText, targetText, pctText }: GaugeProps) {
  const max = target && target > 0 ? target : value > 0 ? value : 1;
  const ratio = Math.max(0, Math.min(value / max, 1));
  const sweep = Math.PI * ratio;

  return (
    <svg viewBox="0 0 260 150" style={{ width: "100%", maxWidth: 340, display: "block", margin: "0 auto" }}>
      {/* dashed target track */}
      <path
        d={arcPath(0, Math.PI)}
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={6}
        strokeDasharray="2 7"
        strokeLinecap="round"
      />
      {/* achieved arc */}
      {ratio > 0 && (
        <path
          d={arcPath(0, sweep)}
          fill="none"
          stroke={palette.emerald}
          strokeWidth={16}
          strokeLinecap="round"
        />
      )}
      {/* needle tick at the achieved end */}
      {ratio > 0 && ratio < 1 && (
        <line
          x1={polar(sweep, R - 14).x}
          y1={polar(sweep, R - 14).y}
          x2={polar(sweep, R + 12).x}
          y2={polar(sweep, R + 12).y}
          stroke="#D1FAE5"
          strokeWidth={3}
        />
      )}
      {/* end labels */}
      <text x={CX - R} y={CY + 18} fill="rgba(255,255,255,0.8)" fontSize={11} textAnchor="middle">
        0
      </text>
      <text x={CX + R} y={CY + 18} fill="rgba(255,255,255,0.8)" fontSize={11} textAnchor="middle">
        {targetText}
      </text>
      {/* center readout */}
      <text
        x={CX}
        y={CY - 22}
        fill={palette.emerald}
        fontSize={26}
        fontWeight={700}
        textAnchor="middle"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {valueText}
      </text>
      <text x={CX} y={CY - 2} fill="rgba(255,255,255,0.85)" fontSize={12} textAnchor="middle">
        Your MTD ({pctText})
      </text>
    </svg>
  );
}
