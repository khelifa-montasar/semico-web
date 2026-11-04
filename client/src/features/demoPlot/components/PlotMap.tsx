import { MapContainer, TileLayer, Polygon, CircleMarker, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useTokens } from "@/app/hooks/useTokens";
import type { Tokens } from "@/app/theme/tokens";
import { MAP_ATTRIBUTION, MAP_MAX_ZOOM, MAP_TILE_URL, MOISTURE_BANDS, PLOT } from "../config";
import { bandToken } from "../format";
import type { Sensor, Zone } from "../types";

/**
 * Satellite map of the demo plot.
 *
 * Three layers only, as specified: zone polygons, sensor dots, and one non-interactive water-source
 * icon. No pipes, no valves, no flow lines.
 *
 * Two implementation notes:
 *
 * - Leaflet's default marker uses PNG assets resolved relative to the stylesheet, which routinely
 *   breaks under a bundler. Both markers here are drawn instead — circles for sensors, an inline-SVG
 *   `divIcon` for the water source — so there is no image asset to go missing.
 * - `scrollWheelZoom` is off because the map sits inside a scrolling page; hijacking the wheel
 *   traps the user mid-scroll. Zoom remains available on the control and by double-click.
 */

const BAND_LABEL_KEY = {
  red: "bandCritical",
  amber: "bandLow",
  green: "bandOptimal",
  blue: "bandWet",
} as const;

function bandColour(moisture: number, tokens: Tokens): string {
  return tokens[bandToken(moisture)];
}

/** A droplet in the accent blue. */
function waterSourceIcon(tokens: Tokens): L.DivIcon {
  return L.divIcon({
    className: "",
    html:
      `<div style="width:26px;height:26px;border-radius:999px;display:flex;align-items:center;` +
      `justify-content:center;background:${tokens.card};border:1px solid ${tokens.blue};">` +
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${tokens.blue}" ` +
      `stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M12 2.7 6.6 8.9a7.5 7.5 0 1 0 10.8 0Z"/></svg></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export function PlotMap({
  zones,
  sensors,
  onSelectZone,
}: {
  zones: Zone[];
  sensors: Sensor[];
  onSelectZone: (zoneId: string, sensorId: string | null) => void;
}) {
  const { t, font } = useLanguage();
  const c = useTokens();
  const d = t.demoPlot.map;

  // Just outside the plot's north-west corner, so the icon never covers a zone.
  const northWest = zones[0]?.bounds[0];
  const waterSource: [number, number] = northWest
    ? [northWest[0] + 0.00012, northWest[1] - 0.00028]
    : [PLOT.center.lat, PLOT.center.lng];

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${c.border}`, height: 520 }}>
        <MapContainer
          center={[PLOT.center.lat, PLOT.center.lng]}
          zoom={PLOT.zoom}
          maxZoom={MAP_MAX_ZOOM}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
        >
          {/* Esri World Imagery. The attribution Leaflet renders from this prop is required by
              Esri's terms of use. */}
          <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} maxZoom={MAP_MAX_ZOOM} />

          {/* Layer 1 — zone polygons, coloured by moisture band. */}
          {zones.map((zone) => {
            const colour = bandColour(zone.moisture, c);
            return (
              <Polygon
                key={zone.id}
                positions={zone.bounds}
                pathOptions={{
                  color: colour,
                  // A heavier stroke while watering, so "this zone is being irrigated right now" is
                  // visible on the map and not only in the KPI bar.
                  weight: zone.valveOpen ? 3 : 2,
                  fillColor: colour,
                  fillOpacity: 0.45,
                  opacity: 0.95,
                }}
                eventHandlers={{ click: () => onSelectZone(zone.id, null) }}
              />
            );
          })}

          {/* Layer 2 — sensor dots, same colour scale. Positions come from config, which places the
              two sensors a third and two thirds across each zone. */}
          {zones.flatMap((zone) =>
            sensors
              .filter((sensor) => sensor.zoneId === zone.id)
              .map((sensor) => (
                <CircleMarker
                  key={sensor.id}
                  center={[sensor.position.lat, sensor.position.lng]}
                  radius={5}
                  pathOptions={{
                    // A surface-coloured ring keeps overlapping dots readable.
                    color: c.card,
                    weight: 2,
                    fillColor: sensor.online ? bandColour(zone.moisture, c) : c.sec,
                    fillOpacity: 1,
                  }}
                  eventHandlers={{ click: () => onSelectZone(zone.id, sensor.id) }}
                />
              )),
          )}

          {/* Layer 3 — water source. Non-interactive by design. */}
          <Marker
            position={waterSource}
            icon={waterSourceIcon(c)}
            interactive={false}
            keyboard={false}
          />
        </MapContainer>
      </div>

      {/* Legend — chrome rather than a layer. Each band is written out, so the colours are never
          the only carrier of the reading. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2" style={{ fontFamily: font }}>
        <span
          className="text-[10px] tracking-wider uppercase"
          style={{ fontFamily: "JetBrains Mono", color: c.sec }}
        >
          {d.legend}
        </span>
        {MOISTURE_BANDS.map((band) => (
          <span key={band.key} className="flex items-center gap-1.5 text-[11px]" style={{ color: c.sec }}>
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: c[band.token],
                display: "inline-block",
              }}
            />
            {d[BAND_LABEL_KEY[band.key]]}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: c.sec }}>
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke={c.blue}
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M12 2.7 6.6 8.9a7.5 7.5 0 1 0 10.8 0Z" />
          </svg>
          {d.waterSource}
        </span>
      </div>

      <p
        className="text-[10px]"
        style={{ fontFamily: "JetBrains Mono", color: c.sec, direction: "ltr", unicodeBidi: "isolate" }}
      >
        {PLOT.center.lat}°N, {PLOT.center.lng}°E · {d.address}
      </p>
    </div>
  );
}
