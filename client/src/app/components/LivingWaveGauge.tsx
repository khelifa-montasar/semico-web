/**
 * LivingWaveGauge
 *
 * A circular "living water" gauge that fills from the bottom proportional to
 * moisture percentage. Two animated sine-wave layers give depth and motion.
 *
 * Color logic:
 *   > 60%  → Semico Green #00A859
 *   30–60% → Energy Orange #FF6B35
 *   < 30%  → Energy Orange + subtle scale/glow pulse
 */
import { useEffect, useId, useMemo } from "react";

// ─── Shared keyframe CSS (injected once into <head>) ─────────────────────────
const STYLE_ID = "lwg-keyframes";
const WAVE_CSS = `
  @keyframes lwgFront {
    from { transform: translateX(0px); }
    to   { transform: translateX(-80px); }
  }
  @keyframes lwgBack {
    from { transform: translateX(-38px); }
    to   { transform: translateX(-147px); }
  }
  @keyframes lwgPulseLight {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(255, 107, 53, 0);
      transform: scale(1);
    }
    50% {
      box-shadow: 0 0 14px 6px rgba(255, 107, 53, 0.20);
      transform: scale(1.02);
    }
  }
  @keyframes lwgPulseDark {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(248, 81, 73, 0);
      transform: scale(1);
    }
    50% {
      box-shadow: 0 0 14px 6px rgba(248, 81, 73, 0.25);
      transform: scale(1.02);
    }
  }
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the wave fill color based on moisture value and theme.
 *
 * Dark  → GitHub palette (green / warning yellow / critical red)
 * Light → Semico original palette (green / energy orange)
 */
function waveColor(value: number, isDark: boolean): string {
  if (isDark) {
    if (value > 60) return "#3FB950";   // GitHub success green
    if (value >= 30) return "#D29922";  // GitHub warning yellow
    return "#F85149";                    // GitHub critical red
  }
  return value > 60 ? "#00A859" : "#FF6B35";
}

/**
 * Builds a closed SVG path for a filled sine-wave shape.
 * Wave crown → right → drop to bottom → back to left → close.
 * Uses cubic Bézier approximation of sin (tension ≈ 0.3665).
 */
function buildWavePath(
  totalWidth: number,
  yMid: number,
  amplitude: number,
  wavelength: number,
  bottomY: number
): string {
  let d = `M 0,${yMid.toFixed(2)}`;
  let x = 0;
  while (x < totalWidth) {
    const x1 = (x + wavelength * 0.25).toFixed(2);
    const x2 = (x + wavelength * 0.75).toFixed(2);
    const xe = (x + wavelength).toFixed(2);
    const yUp = (yMid - amplitude).toFixed(2);
    const yDn = (yMid + amplitude).toFixed(2);
    const yM  = yMid.toFixed(2);
    d += ` C ${x1},${yUp} ${x2},${yDn} ${xe},${yM}`;
    x += wavelength;
  }
  d += ` L ${totalWidth},${bottomY} L 0,${bottomY} Z`;
  return d;
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface LivingWaveGaugeProps {
  /** Moisture level 0–100 */
  value: number;
  /** Applies dark-mode palette */
  isDark: boolean;
  /** Diameter in px (default 160) */
  size?: number;
}

export function LivingWaveGauge({ value, isDark, size = 160 }: LivingWaveGaugeProps) {
  // Unique IDs for SVG <defs> to avoid cross-instance conflicts
  const rawId = useId();
  const uid    = rawId.replace(/[^a-zA-Z0-9]/g, "_");
  const clipId = `${uid}clip`;
  const grdId  = `${uid}grad`;
  const grdAId = `${uid}gradA`; // back layer fill

  // ── Inject shared keyframe CSS once ────────────────────────────────────────
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = WAVE_CSS;
    document.head.appendChild(el);
  }, []);

  // ── Geometry ───────────────────────────────────────────────────────────────
  const r         = size / 2;
  const amplitude = Math.round(size * 0.0375); // ≈ 6 px at 160 px
  const wlFront   = 80;  // px – one forward scroll period
  const wlBack    = 109; // px – one back-scroll period (longer → slower feel)

  // Wave midline Y: 0 % → near bottom, 100 % → near top (clamped to stay visible)
  const yMid = Math.max(
    amplitude + 5,
    Math.min(size - amplitude - 5, size * (1 - value / 100))
  );

  // Build wave paths (memoised – only recompute when value/size change)
  const pathFront = useMemo(
    () => buildWavePath(wlFront * 8, yMid, amplitude, wlFront, size),
     
    [yMid, amplitude, size]
  );
  const pathBack = useMemo(
    () => buildWavePath(wlBack * 7, yMid + amplitude * 0.5, amplitude * 1.35, wlBack, size),
     
    [yMid, amplitude, size]
  );

  // ── Palette ────────────────────────────────────────────────────────────────
  const color       = waveColor(value, isDark);
  const isPulse     = value < 30;
  const borderColor = isDark ? "#30363D" : "#EAECF0";
  const textColor   = isDark ? "#FFFFFF" : "#4A4A4A";
  // Pill: darker base in dark mode so white text pops cleanly
  const pillFill    = isDark ? "rgba(13,17,23,0.80)" : "rgba(255,255,255,0.78)";
  // Subtle tinted background inside circle (very light wash)
  const circleBg    = isDark
    ? "rgba(22,27,34,0.45)"
    : value > 60
      ? "rgba(0,168,89,0.03)"
      : "rgba(255,107,53,0.03)";

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        position: "relative",
        flexShrink: 0,
        animation: isPulse
          ? `${isDark ? "lwgPulseDark" : "lwgPulseLight"} 2s ease-in-out infinite`
          : "none",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: "block" }}
        aria-label={`Moisture gauge: ${value}%`}
        role="img"
      >
        <defs>
          {/* ── Circular clip mask ── */}
          <clipPath id={clipId}>
            <circle cx={r} cy={r} r={r - 1} />
          </clipPath>

          {/* ── Front wave gradient (top-lighter → bottom-full) ── */}
          <linearGradient id={grdId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor={color} stopOpacity={0.82} />
            <stop offset="100%" stopColor={color} stopOpacity={1}    />
          </linearGradient>

          {/* ── Back wave fill ── */}
          <linearGradient id={grdAId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0.30} />
          </linearGradient>
        </defs>

        {/* ── Tinted background circle ── */}
        <circle cx={r} cy={r} r={r - 1} fill={circleBg} />

        {/* ── Animated waves (clipped to circle) ── */}
        <g clipPath={`url(#${clipId})`}>

          {/* Back layer: lighter opacity, slower animation, larger amplitude */}
          <g style={{ animation: "lwgBack 4s linear infinite", willChange: "transform" }}>
            <path d={pathBack} fill={`url(#${grdAId})`} />
          </g>

          {/* Front layer: gradient, faster animation */}
          <g style={{ animation: "lwgFront 2.5s linear infinite", willChange: "transform" }}>
            <path d={pathFront} fill={`url(#${grdId})`} />
          </g>

          {/* ── Subtle inner highlight at wave surface ── */}
          <ellipse
            cx={r}
            cy={yMid}
            rx={r * 0.55}
            ry={amplitude * 0.6}
            fill="rgba(255,255,255,0.12)"
            style={{ pointerEvents: "none" }}
          />
        </g>

        {/* ── Border ring (rendered after waves so it sits on top) ── */}
        <circle
          cx={r}
          cy={r}
          r={r - 0.5}
          fill="none"
          stroke={borderColor}
          strokeWidth={1}
        />

        {/* ── Frosted pill backdrop behind text ── */}
        <rect
          x={r - 40}
          y={r - 15}
          width={80}
          height={30}
          rx={15}
          fill={pillFill}
        />

        {/* ── Percentage label — vertically centred at circle midpoint ── */}
        <text
          x={r}
          y={r}
          textAnchor="middle"
          dominantBaseline="central"
          fill={textColor}
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: size >= 160 ? 26 : 20,
            fontWeight: 400,
          }}
        >
          {value}%
        </text>
      </svg>
    </div>
  );
}