import { Link } from "react-router";
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw } from "lucide-react";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useTokens } from "@/app/hooks/useTokens";
import { SIMULATION } from "../config";
import type { SimulationControls } from "../types";

/**
 * The amber simulation banner.
 *
 * Non-dismissible on purpose: every number on this page is synthetic, and the disclaimer has to be
 * on screen the whole time rather than acknowledged once and forgotten. The tint is derived from
 * the `warn` token with `color-mix`, so it follows the palette instead of hard-coding a second
 * amber that would drift from it.
 *
 * Also hosts the pause/resume/speed controls, which the layout spec required but did not place.
 */
export function SimulationBanner({ running, speed, toggle, setSpeed, reset }: SimulationControls) {
  const { t, isRTL, font } = useLanguage();
  const c = useTokens();
  const d = t.demoPlot;

  const ArrowIcon = isRTL ? ArrowLeft : ArrowRight;

  return (
    <div
      className="rounded-xl border px-6 py-4 flex flex-wrap items-center gap-4"
      style={{
        borderColor: c.warn,
        background: `color-mix(in srgb, ${c.warn} 12%, transparent)`,
        fontFamily: font,
      }}
      role="status"
    >
      <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>
        ⚠
      </span>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" style={{ color: c.text }}>
        <strong style={{ fontWeight: 500 }}>{d.banner.mode}</strong>
        <span style={{ color: c.sec }}>·</span>
        <span>{d.banner.site}</span>
        <span style={{ color: c.sec }}>·</span>
        {/* Mono + isolated so the separator and digits stay LTR inside Arabic. */}
        <span style={{ color: c.sec, fontFamily: "JetBrains Mono", direction: "ltr", unicodeBidi: "isolate" }}>
          {d.banner.disclaimer}
        </span>
      </div>

      <div className="ms-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={running ? d.controls.pause : d.controls.resume}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] transition-colors"
          style={{ border: `1px solid ${c.border}`, background: c.card, color: c.text, fontFamily: font }}
        >
          {running ? <Pause size={13} strokeWidth={1.5} /> : <Play size={13} strokeWidth={1.5} />}
          {running ? d.controls.pause : d.controls.resume}
        </button>

        <div
          className="flex items-center rounded-full overflow-hidden"
          style={{ border: `1px solid ${c.border}`, background: c.card }}
        >
          {SIMULATION.speeds.map((option) => {
            const active = option === speed;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setSpeed(option)}
                aria-label={`${d.controls.speed} ${option}${d.controls.speedValue}`}
                className="px-2.5 py-1.5 text-[12px] transition-colors"
                style={{
                  fontFamily: "JetBrains Mono",
                  direction: "ltr",
                  unicodeBidi: "isolate",
                  background: active ? c.green : "transparent",
                  color: active ? "#FFFFFF" : c.sec,
                  fontWeight: active ? 500 : 400,
                }}
              >
                {option}
                {d.controls.speedValue}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={reset}
          aria-label={d.controls.reset}
          title={d.controls.reset}
          className="flex items-center justify-center w-7 h-7 rounded-full transition-colors"
          style={{ border: `1px solid ${c.border}`, background: c.card, color: c.sec }}
        >
          <RotateCcw size={13} strokeWidth={1.5} />
        </button>

        <Link
          to="/dashboard"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] transition-colors"
          style={{ border: `1px solid ${c.border}`, background: c.card, color: c.text, fontFamily: font }}
        >
          {d.banner.back} <ArrowIcon size={13} strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}
