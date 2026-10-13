import { useRef, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineConfig {
  dataKey: string;
  color: string;
  name?: string;
  areaFill?: string;
}

interface RefLineConfig {
  y: number;
  stroke: string;
  dash?: string;
}

export interface SvgLineChartProps {
  data: Record<string, number | string>[];
  xKey: string;
  lines: LineConfig[];
  width: number;
  height: number;
  yDomain?: [number, number];
  yTicks?: number[];
  /** Render an x-axis label every N data points */
  xTickEvery?: number;
  refLines?: RefLineConfig[];
  /** Override display name per dataKey in the tooltip */
  tooltipLabels?: Record<string, string>;
  /** Show horizontal grid lines (default: true) */
  showGrid?: boolean;
  /** Apply dark-mode palette to tooltip and hover elements */
  isDark?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const M = { top: 8, right: 8, bottom: 28, left: 40 };

function scaleY(value: number, yMin: number, yMax: number, plotH: number) {
  return plotH - ((value - yMin) / (yMax - yMin)) * plotH;
}

function scaleX(index: number, count: number, plotW: number) {
  return count <= 1 ? 0 : (index / (count - 1)) * plotW;
}

/** Smooth cubic-bezier path (Catmull-Rom → cubic bezier) */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cpX = (x0 + x1) / 2;
    d += ` C ${cpX},${y0} ${cpX},${y1} ${x1},${y1}`;
  }
  return d;
}

/** Closed area path: line curve + vertical drop to baseline */
function areaPath(pts: [number, number][], baselineY: number): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]},${baselineY} L ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cpX = (x0 + x1) / 2;
    d += ` C ${cpX},${y0} ${cpX},${y1} ${x1},${y1}`;
  }
  d += ` L ${pts[pts.length - 1][0]},${baselineY} Z`;
  return d;
}
// ─── Component ───────────────────────────────────────────────────────────────

export function SvgLineChart({
  data,
  xKey,
  lines,
  width,
  height,
  yDomain,
  yTicks,
  xTickEvery = 4,
  refLines = [],
  tooltipLabels = {},
  showGrid = true,
  isDark = false,
}: SvgLineChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const plotW = width - M.left - M.right;
  const plotH = height - M.top - M.bottom;

  // Compute y domain from data if not provided
  const allValues = lines.flatMap((l) =>
    data.map((d) => Number(d[l.dataKey] ?? 0))
  );
  const yMin = yDomain?.[0] ?? Math.min(...allValues);
  const yMax = yDomain?.[1] ?? Math.max(...allValues);

  const defaultYTicks = yTicks ?? (() => {
    const step = Math.ceil((yMax - yMin) / 4 / 10) * 10;
    const ticks: number[] = [];
    let t = Math.ceil(yMin / 10) * 10;
    while (t <= yMax) {
      ticks.push(t);
      t += step;
    }
    return ticks;
  })();

  // Point coordinates per line
  const linePoints = lines.map((l) =>
    data.map((d, i): [number, number] => [
      M.left + scaleX(i, data.length, plotW),
      M.top + scaleY(Number(d[l.dataKey] ?? 0), yMin, yMax, plotH),
    ])
  );

  // Mouse interaction
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left - M.left;
      const idx = Math.round((mouseX / plotW) * (data.length - 1));
      setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
    },
    [plotW, data.length]
  );

  const handleMouseLeave = useCallback(() => setHoverIdx(null), []);

  // Tooltip position
  const tooltipX = hoverIdx !== null ? M.left + scaleX(hoverIdx, data.length, plotW) : 0;
  const tooltipY = M.top;
  const flipToLeft = tooltipX > width * 0.6;

  return (
    <div style={{ position: "relative", width, height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ display: "block", cursor: "crosshair" }}
      >
        {/* ── Horizontal grid lines */}
        {showGrid && defaultYTicks.map((tick) => {
          const cy = M.top + scaleY(tick, yMin, yMax, plotH);
          return (
            <line
              key={`grid-${tick}`}
              x1={M.left}
              x2={M.left + plotW}
              y1={cy}
              y2={cy}
              stroke={isDark ? "#30363D" : "#EAECF0"}
              strokeWidth={1}
            />
          );
        })}

        {/* ── Y-axis labels */}
        {defaultYTicks.map((tick) => {
          const cy = M.top + scaleY(tick, yMin, yMax, plotH);
          return (
            <text
              key={`ytick-${tick}`}
              x={M.left - 6}
              y={cy + 4}
              textAnchor="end"
              fill={isDark ? "rgba(255,255,255,0.65)" : "#9CA3AF"}
              style={{ fontFamily: "JetBrains Mono", fontSize: 10 }}
            >
              {tick}
            </text>
          );
        })}

        {/* ── X-axis labels */}
        {data.map((d, i) => {
          if (i % xTickEvery !== 0) return null;
          const cx = M.left + scaleX(i, data.length, plotW);
          return (
            <text
              key={`xtick-${i}`}
              x={cx}
              y={M.top + plotH + 18}
              textAnchor="middle"
              fill={isDark ? "rgba(255,255,255,0.65)" : "#9CA3AF"}
              style={{ fontFamily: "JetBrains Mono", fontSize: 10 }}
            >
              {String(d[xKey])}
            </text>
          );
        })}

        {/* ── Reference lines */}
        {refLines.map((rl, ri) => {
          const cy = M.top + scaleY(rl.y, yMin, yMax, plotH);
          return (
            <line
              key={`ref-${ri}`}
              x1={M.left}
              x2={M.left + plotW}
              y1={cy}
              y2={cy}
              stroke={rl.stroke}
              strokeWidth={1}
              strokeDasharray={rl.dash ?? "4 4"}
            />
          );
        })}

        {/* ── Area fills (rendered before lines so lines appear on top) */}
        {lines.map((l, li) =>
          l.areaFill ? (
            <path
              key={`area-${l.dataKey}`}
              d={areaPath(linePoints[li], M.top + plotH)}
              fill={l.areaFill}
            />
          ) : null
        )}

        {/* ── Data lines */}
        {lines.map((l, li) => (
          <path
            key={`line-${l.dataKey}`}
            d={smoothPath(linePoints[li])}
            fill="none"
            stroke={l.color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* ── Hover vertical line */}
        {hoverIdx !== null && (
          <line
            x1={tooltipX}
            x2={tooltipX}
            y1={M.top}
            y2={M.top + plotH}
            stroke={isDark ? "#30363D" : "#EAECF0"}
            strokeWidth={1}
          />
        )}

        {/* ── Hover dots */}
        {hoverIdx !== null &&
          lines.map((l, li) => {
            const [cx, cy] = linePoints[li][hoverIdx];
            return (
              <circle
                key={`dot-${l.dataKey}`}
                cx={cx}
                cy={cy}
                r={3.5}
                fill="white"
                stroke={l.color}
                strokeWidth={1.5}
              />
            );
          })}
      </svg>

      {/* ── HTML Tooltip overlay */}
      {hoverIdx !== null && (
        <div
          style={{
            position: "absolute",
            top: tooltipY,
            left: flipToLeft ? tooltipX - 8 : tooltipX + 8,
            transform: flipToLeft ? "translateX(-100%)" : "translateX(0)",
            background: isDark
              ? "rgba(22,27,34,0.96)"
              : "rgba(255,255,255,0.92)",
            backdropFilter: "blur(8px)",
            border: `1px solid ${isDark ? "#30363D" : "#EAECF0"}`,
            borderRadius: 8,
            padding: "6px 10px",
            pointerEvents: "none",
            zIndex: 10,
            minWidth: 100,
          }}
        >
          <p
            style={{
              fontFamily: "JetBrains Mono",
              fontSize: 11,
              color: isDark ? "#C9D1D9" : "#9CA3AF",
              marginBottom: 3,
            }}
          >
            {String(data[hoverIdx][xKey])}
          </p>
          {lines.map((l) => (
            <p
              key={l.dataKey}
              style={{
                fontFamily: "JetBrains Mono",
                fontSize: 11,
                color: l.color,
                margin: 0,
              }}
            >
              {tooltipLabels[l.dataKey] ?? l.dataKey}:{" "}
              {String(data[hoverIdx][l.dataKey])}
              {typeof data[hoverIdx][l.dataKey] === "number" ? "%" : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}