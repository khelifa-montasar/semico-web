import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_ATTRIBUTION, MAP_MAX_ZOOM, MAP_TILE_URL, PLOT } from "../demoPlot/config";
import { bandToken } from "../demoPlot/format";
import { plotDimensionsForArea, sensorSlotPositions, zoneRectangles, type LatLng } from "./geometry";
import { useTokens } from "@/app/hooks/useTokens";
import { useMapViewport, type MapViewport } from "./useMapViewport";

export interface FarmMapZone {
  id: string;
  name: string;
  moisture: number | null;
  valveState: "OPEN" | "CLOSED";
  layoutOnly?: boolean;
}

export interface FarmMapSensor {
  id: string;
  key: string;
  zoneId: string;
  connection: "ONLINE" | "OFFLINE";
}

function ViewportSync({
  viewport,
  onChange,
}: {
  viewport: MapViewport;
  onChange: (viewport: MapViewport) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const center = map.getCenter();
    if (
      Math.abs(center.lat - viewport.center[0]) > 0.000001 ||
      Math.abs(center.lng - viewport.center[1]) > 0.000001 ||
      map.getZoom() !== viewport.zoom
    ) {
      map.setView(viewport.center, viewport.zoom, { animate: false });
    }
  }, [map, viewport.center, viewport.zoom]);

  useMapEvents({
    moveend(event) {
      const center = event.target.getCenter();
      onChange({ center: [center.lat, center.lng], zoom: event.target.getZoom() });
    },
  });
  return null;
}

/** The farm field map; viewport state is shared between Dashboard and Technical Diagnostics. */
export function FarmMap({
  zones,
  sensors = [],
  height = 420,
  selectedZoneId = null,
  boundary = null,
  center,
  farmId,
  landAreaHa,
  zoneCount = zones.length,
  sensorsPerZone = 2,
  rainfallIntensity = 0,
  onSelectZone,
}: {
  zones: FarmMapZone[];
  sensors?: FarmMapSensor[];
  height?: number;
  selectedZoneId?: string | null;
  boundary?: Array<[number, number]> | null;
  center?: LatLng;
  farmId?: string;
  landAreaHa?: number | null;
  zoneCount?: number;
  sensorsPerZone?: number;
  /** Millimetres applied to the rainfall-scenario overlay, 0..50. */
  rainfallIntensity?: number;
  onSelectZone?: (zoneId: string) => void;
}) {
  const c = useTokens();
  const initialCenter = center ?? (boundary && boundary.length > 0
    ? [
        boundary.reduce((sum, point) => sum + point[0], 0) / boundary.length,
        boundary.reduce((sum, point) => sum + point[1], 0) / boundary.length,
      ] as LatLng
    : [PLOT.center.lat, PLOT.center.lng]);
  const { viewport, saveViewport } = useMapViewport(farmId, initialCenter, PLOT.zoom);
  const layoutZones = Array.from({ length: zoneCount }, (_, index) =>
    zones[index] ?? {
      id: `layout-zone-${index}`,
      name: `Zone ${index + 1}`,
      moisture: null,
      valveState: "CLOSED" as const,
      layoutOnly: true,
    },
  );
  const rectangles = zoneRectangles(
    layoutZones.length,
    { lat: initialCenter[0], lng: initialCenter[1] },
    plotDimensionsForArea(landAreaHa),
  );
  const sensorGroups = new Map<string, FarmMapSensor[]>();
  for (const sensor of sensors) {
    const group = sensorGroups.get(sensor.zoneId) ?? [];
    group.push(sensor);
    sensorGroups.set(sensor.zoneId, group);
  }

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${c.border}`, height }}>
      <MapContainer
        key={farmId ?? "default"}
        center={viewport.center}
        zoom={viewport.zoom}
        maxZoom={MAP_MAX_ZOOM}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} maxZoom={MAP_MAX_ZOOM} />
        <ViewportSync viewport={viewport} onChange={saveViewport} />

        {boundary && boundary.length >= 3 && (
          <Polygon
            positions={boundary}
            pathOptions={{ color: c.blue, weight: 2, dashArray: "6 4", fill: false, interactive: false }}
          />
        )}

        {layoutZones.map((zone, index) => {
          const rectangle = rectangles[index];
          if (!rectangle) return null;
          const colour = zone.layoutOnly || zone.moisture === null ? c.sec : c[bandToken(zone.moisture)];
          const selected = !zone.layoutOnly && zone.id === selectedZoneId;
          const label = zone.moisture === null ? zone.name : `${zone.name} — ${zone.moisture.toFixed(1)}%`;
          return (
            <Polygon
              key={zone.id}
              positions={rectangle.ring}
              pathOptions={{
                color: rainfallIntensity > 0 ? "#38BDF8" : colour,
                weight: selected ? 4 : zone.valveState === "OPEN" ? 3 : 2,
                fillColor: rainfallIntensity > 0 ? "#38BDF8" : colour,
                fillOpacity: zone.layoutOnly ? 0.08 : rainfallIntensity > 0 ? 0.12 + Math.min(50, rainfallIntensity) / 50 * 0.38 : selected ? 0.6 : 0.45,
                opacity: zone.layoutOnly ? 0.5 : 0.95,
                dashArray: zone.layoutOnly ? "4 4" : undefined,
              }}
              eventHandlers={onSelectZone && !zone.layoutOnly ? { click: () => onSelectZone(zone.id) } : undefined}
            >
              <Tooltip sticky>{rainfallIntensity > 0 ? `${label} · Rainfall ${rainfallIntensity} mm` : label}</Tooltip>
            </Polygon>
          );
        })}

        {layoutZones.map((zone, zoneIndex) => {
          const rectangle = rectangles[zoneIndex];
          if (!rectangle || zone.layoutOnly) return null;
          const zoneSensors = sensorGroups.get(zone.id) ?? [];
          const slotCount = Math.max(sensorsPerZone, zoneSensors.length);
          const positions = sensorSlotPositions(rectangle, slotCount);
          return positions.map((position, sensorIndex) => {
            const sensor = zoneSensors[sensorIndex];
            if (!sensor) {
              return (
                <CircleMarker
                  key={`${zone.id}-slot-${sensorIndex}`}
                  center={position}
                  radius={3}
                  pathOptions={{ color: c.sec, weight: 1, fillColor: c.card, fillOpacity: 0.7, dashArray: "2 3" }}
                  interactive={false}
                />
              );
            }
            const online = sensor.connection === "ONLINE";
            return (
              <CircleMarker
                key={sensor.id}
                center={position}
                radius={4}
                pathOptions={{ color: c.card, weight: 1, fillColor: online ? c.green : c.crit, fillOpacity: 1 }}
              >
                <Tooltip>{sensor.key} · {online ? "Online" : "Offline"}</Tooltip>
              </CircleMarker>
            );
          });
        })}
      </MapContainer>
    </div>
  );
}
