import { useId } from "react";
import { FARM_TIMEZONE, type FieldHistoryPoint } from "@semico/shared";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useTokens } from "@/app/hooks/useTokens";
import { useChartWidth } from "@/app/hooks/useChartWidth";

export function moistureSegments(
  points: FieldHistoryPoint[],
): Array<Array<{ index: number; value: number }>> {
  const segments: Array<Array<{ index: number; value: number }>> = [];
  let current: Array<{ index: number; value: number }> = [];
  points.forEach((point, index) => {
    if (point.moisture == null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push({ index, value: point.moisture });
    }
  });
  if (current.length) segments.push(current);
  return segments;
}

export function HistoryChart({ points }: { points: FieldHistoryPoint[] }) {
  const { t, lang } = useLanguage();
  const colors = useTokens();
  const titleId = useId();
  const [containerRef, measuredWidth] = useChartWidth();
  const chartWidth = Math.max(measuredWidth || 710, 240);
  const right = chartWidth - 34;
  const segments = moistureSegments(points);
  const copy = t.fieldHistory;
  const time = new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : "en-GB", {
    timeZone: FARM_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const horizontal = (index: number) =>
    44 + (index / Math.max(points.length - 1, 1)) * (right - 44);
  const vertical = (value: number) =>
    170 - Math.min(100, Math.max(0, value)) * 1.5;
  return (
    <div ref={containerRef}>
      <p className="text-xs mb-2" style={{ color: colors.sec }}>
        {copy.hourlyAverage}
      </p>
      {segments.length ? (
        <svg
          viewBox={`0 0 ${chartWidth} 215`}
          className="w-full"
          role="img"
          aria-labelledby={titleId}
          style={{ direction: "ltr" }}
        >
          <title id={titleId}>{copy.chartTitle}</title>
          {[0, 25, 50, 75, 100].map((value) => (
            <g key={value}>
              <line
                x1={44}
                x2={right}
                y1={vertical(value)}
                y2={vertical(value)}
                stroke={colors.divider}
              />
              <text
                x={36}
                y={vertical(value) + 4}
                textAnchor="end"
                fontSize={11}
                fill={colors.sec}
              >
                {value}%
              </text>
            </g>
          ))}
          <line
            x1={44}
            x2={right}
            y1={vertical(18)}
            y2={vertical(18)}
            stroke={colors.crit}
            strokeDasharray="4 4"
          />
          {segments.map((segment, index) => (
            <polyline
              key={index}
              points={segment
                .map(
                  (point) =>
                    `${horizontal(point.index)},${vertical(point.value)}`,
                )
                .join(" ")}
              fill="none"
              stroke={colors.green}
              strokeWidth={2.5}
            />
          ))}
          {points.map((point, index) =>
            point.moisture == null ? null : (
              <circle
                key={point.at}
                cx={horizontal(index)}
                cy={vertical(point.moisture)}
                r={3.5}
                fill={colors.green}
              >
                <title>{`${time.format(new Date(point.at))}: ${point.moisture.toFixed(1)}%`}</title>
              </circle>
            ),
          )}
          {[0, 6, 12, 18, 23]
            .filter((index) => points[index])
            .map((index) => (
              <text
                key={index}
                x={horizontal(index)}
                y={199}
                textAnchor="middle"
                fontSize={11}
                fill={colors.sec}
              >
                {time.format(new Date(points[index].at))}
              </text>
            ))}
        </svg>
      ) : (
        <p
          role="status"
          className="py-8 text-center text-sm"
          style={{ color: colors.sec }}
        >
          {copy.noReadings}
        </p>
      )}
      <details className="text-xs mt-2">
        <summary className="cursor-pointer py-2" style={{ color: colors.sec }}>
          {copy.showReadings}
        </summary>
        <div className="max-h-48 overflow-auto">
          <table className="w-full text-start">
            <thead>
              <tr>
                <th className="p-2 text-start" scope="col">
                  {copy.time}
                </th>
                <th className="p-2 text-start" scope="col">
                  {copy.moisture}
                </th>
                <th className="p-2 text-start" scope="col">
                  {copy.samples}
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.at}>
                  <td className="p-2">{time.format(new Date(point.at))}</td>
                  <td className="p-2">
                    {point.moisture == null
                      ? "—"
                      : `${point.moisture.toFixed(1)}%`}
                  </td>
                  <td className="p-2">{point.samples}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
