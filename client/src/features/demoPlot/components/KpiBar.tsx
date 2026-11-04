import { Droplets, Leaf, Gauge, BellRing, Timer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useTokens } from "@/app/hooks/useTokens";
import { BMC } from "../config";
import type { KpiSnapshot } from "../types";

/**
 * The five KPI cards.
 *
 * Every figure is derived from the simulation state (`toKpis`), never accumulated separately — so a
 * card cannot drift from the plot it describes. Card 3 is the exception and is deliberately a fixed
 * number: it is the Business Model Canvas claim, and labelling it "estimated" is the honest way to
 * show a projection next to live values.
 */

interface CardSpec {
  icon: LucideIcon;
  accent: string;
  label: string;
  value: string;
  sub: string;
}

function KpiCard({ card, font, sec, border, cardBg, ink }: {
  card: CardSpec;
  font: string;
  sec: string;
  border: string;
  cardBg: string;
  ink: string;
}) {
  const Icon = card.icon;

  return (
    <div
      className="flex flex-col gap-3 overflow-hidden"
      style={{
        border: `1px solid ${border}`,
        background: cardBg,
        borderRadius: 12,
        padding: 24,
        fontFamily: font,
      }}
    >
      {/*
        The accent is carried by a MARK rather than by the value text.
        Colour was validated with the dataviz palette checker: light-mode Energy Orange is only
        2.76:1 against a white card, so orange numerals are genuinely hard to read — and green vs
        orange separate by just ΔE 6.8 (light) / 5.1 (dark) under protanopia, so colour must never
        be the only thing distinguishing two cards. Every card therefore has its own icon and label,
        with the accent as redundant reinforcement.
      */}
      <div
        aria-hidden="true"
        style={{
          height: 3,
          width: 28,
          borderRadius: 2,
          background: card.accent,
          marginTop: -8,
          marginBottom: 4,
        }}
      />

      <div className="flex items-center gap-2">
        <Icon size={15} strokeWidth={1.5} style={{ color: card.accent, flexShrink: 0 }} />
        <span className="text-[11px]" style={{ color: sec, lineHeight: 1.4 }}>
          {card.label}
        </span>
      </div>

      <p
        className="text-[28px]"
        style={{
          fontFamily: "JetBrains Mono",
          fontWeight: 400,
          lineHeight: 1,
          color: ink,
          // Numerals stay LTR and isolated inside Arabic text.
          direction: "ltr",
          unicodeBidi: "isolate",
        }}
      >
        {card.value}
      </p>

      <p className="text-[12px]" style={{ color: sec, lineHeight: 1.4 }}>
        {card.sub}
      </p>
    </div>
  );
}

export function KpiBar({ kpis }: { kpis: KpiSnapshot }) {
  const { t, font } = useLanguage();
  const c = useTokens();
  const k = t.demoPlot.kpi;

  const cards: CardSpec[] = [
    {
      icon: Droplets,
      accent: c.green,
      label: k.waterSaved,
      value: `${kpis.savedLitres.toLocaleString("en-US")} L`,
      sub: `${kpis.savedPercent}${k.vsTraditional}`,
    },
    {
      icon: Gauge,
      accent: c.blue,
      label: k.avgMoisture,
      value: `${kpis.averageMoisture} %`,
      sub: `${kpis.optimalZones} / ${kpis.zoneCount} ${k.zonesOptimal}`,
    },
    {
      icon: Leaf,
      accent: c.green,
      label: k.productivity,
      // Fixed, straight from the BMC. The sub-line says so.
      value: `+${BMC.productivityGainPercent} %`,
      sub: k.productivitySub,
    },
    {
      icon: BellRing,
      // Only turns amber when something critical is actually open.
      accent: kpis.criticalAlerts > 0 ? c.warn : c.sec,
      label: k.activeAlerts,
      value: String(kpis.activeAlerts),
      sub: kpis.criticalAlerts > 0 ? `${kpis.criticalAlerts} ${k.critical}` : k.noneCritical,
    },
    {
      icon: Timer,
      accent: c.blue,
      label: k.irrigationStatus,
      value:
        kpis.irrigationStatus === "Active"
          ? k.statusActive
          : kpis.irrigationStatus === "Scheduled"
            ? k.statusScheduled
            : k.statusIdle,
      sub:
        kpis.nextIrrigationInMinutes === null
          ? `${kpis.wateringZones} / ${kpis.zoneCount} ${k.zonesWatering}`
          : `${kpis.wateringZones} / ${kpis.zoneCount} ${k.zonesWatering} · ${k.nextIn} ${kpis.nextIrrigationInMinutes} ${k.minutesShort}`,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
      {cards.map((card) => (
        <KpiCard
          key={card.label}
          card={card}
          font={font}
          sec={c.sec}
          border={c.border}
          cardBg={c.card}
          ink={c.text}
        />
      ))}
    </div>
  );
}
