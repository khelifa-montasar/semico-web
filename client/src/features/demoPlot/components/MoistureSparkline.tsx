import { useState } from "react";
import { useTokens } from "@/app/hooks/useTokens";
import { useChartWidth } from "@/app/hooks/useChartWidth";
import { MOISTURE } from "../config";

/**
 * 24-hour soil moisture sparkline.
 *
 * Hand-rolled SVG, no chart library. Design decisions worth stating:
 *
 * - **One series, so no legend.** The drawer's heading names it; a legend box for a single line is
 *   noise.
 * - **No gridlines, minimal axis.** The only chrome is a baseline and the min/max figures as text.
 * - **Direct value labels.** The chart is never the only carrier of the data: min, max and current
 *   are written out, which also serves anyone who cannot read the line.
 * - **Hover to inspect.** An SVG chart is interactive by default, and a jury demo benefits from
 *   being able to point at an hour and read it.
 * - **Threshold reference line** at the dry band, so a dip is legible as "this is the problem"
 *   rather than just a low number.
 */

const HEIGHT = 132;
const PAD_TOP = 10;
/** Room beneath the plot for the min/max figures. */
const PAD_BOTTOM = 18;

export function MoistureSparkline({ values }: { values: number[] }) {
  const c = useTokens();
  const [ref, width] = useChartWidth();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (values.length < 2) {
    // A single sample has no trend to draw; saying so beats rendering a misleading flat line.
    return (
      <div
        ref={ref}
        className="flex items-center justify-center text-[12px]"
        style={{ height: HEIGHT, color: c.sec, fontFamily: "JetBrains Mono" }}
      >
        —
      </div>
    );
  }

  const plotWidth = Math.max(1, width);
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const min = Math.min(...values);
  const max = Math.max(...values);
  // Never a zero-height domain: a flat line would divide by zero and also read as "no data".
  const span = max - min < 1 ? 1 : max - min;
  const yMin = min - span * 0.1;
  const yMax = max + span * 0.1;

  const xAt = (index: number) => (index / (values.length - 1)) * plotWidth;
  const yAt = (value: number) =>
    PAD_TOP + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;

  const linePath = values
    .map((value, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`)
    .join(" ");

  const baseline = PAD_TOP + plotHeight;
  const areaPath = `${linePath} L ${plotWidth.toFixed(1)},${baseline} L 0,${baseline} Z`;

  const latest = values[values.length - 1] ?? 0;

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - bounds.left) / Math.max(1, bounds.width);
    const index = Math.round(fraction * (values.length - 1));
    setHoverIndex(Math.min(values.length - 1, Math.max(0, index)));
  }

  const hovered = hoverIndex === null ? null : (values[hoverIndex] ?? null);

  return (
    <div ref={ref} style={{ width: "100%" }}>
      {width > 0 && (
        <svg
          width={plotWidth}
          height={HEIGHT}
          role="img"
          aria-label={`Soil moisture, ${values.length} samples, minimum ${min.toFixed(1)}, maximum ${max.toFixed(1)}, now ${latest.toFixed(1)} percent`}
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
          style={{ display: "block", overflow: "visible" }}
        >
          {/* Dry threshold: makes a dip readable as a problem rather than just a small number. */}
          <line
            x1={0}
            y1={yAt(MOISTURE.redBelow)}
            x2={plotWidth}
            y2={yAt(MOISTURE.redBelow)}
            stroke={c.crit}
            strokeWidth={1}
            strokeDasharray="4 4"
            opacity={0.5}
          />

          <path d={areaPath} fill={c.green} opacity={0.12} />
          <path d={linePath} fill="none" stroke={c.green} strokeWidth={2} strokeLinejoin="round" />

          {/* Baseline, the only axis chrome. */}
          <line x1={0} y1={baseline} x2={plotWidth} y2={baseline} stroke={c.border} strokeWidth={1} />

          {/* Current reading, always marked. */}
          <circle cx={xAt(values.length - 1)} cy={yAt(latest)} r={3.5} fill={c.green} />

          {hovered !== null && hoverIndex !== null && (
            <>
              <line
                x1={xAt(hoverIndex)}
                y1={PAD_TOP}
                x2={xAt(hoverIndex)}
                y2={baseline}
                stroke={c.sec}
                strokeWidth={1}
                opacity={0.5}
              />
              <circle
                cx={xAt(hoverIndex)}
                cy={yAt(hovered)}
                r={4.5}
                fill={c.card}
                stroke={c.green}
                strokeWidth={2}
              />
            </>
          )}

          {/* Values written out, so the line is not the only way to read the data. */}
          <text
            x={0}
            y={HEIGHT - 4}
            fontSize={10}
            fill={c.sec}
            fontFamily="JetBrains Mono"
            style={{ direction: "ltr", unicodeBidi: "isolate" }}
          >
            {min.toFixed(0)}–{max.toFixed(0)}%
          </text>
          <text
            x={plotWidth}
            y={HEIGHT - 4}
            textAnchor="end"
            fontSize={10}
            fill={c.sec}
            fontFamily="JetBrains Mono"
            style={{ direction: "ltr", unicodeBidi: "isolate" }}
          >
            {hovered !== null ? hovered.toFixed(1) : latest.toFixed(1)}%
          </text>
        </svg>
      )}
    </div>
  );
}
