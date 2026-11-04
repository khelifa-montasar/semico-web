import { useState } from "react";
import { MapContainer, TileLayer, Polygon, CircleMarker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { X } from "lucide-react";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useTokens } from "@/app/hooks/useTokens";
import { MAP_ATTRIBUTION, MAP_MAX_ZOOM, MAP_TILE_URL, PLOT } from "../demoPlot/config";

/**
 * Draws the farm outline.
 *
 * A plain click-to-add editor rather than a drawing library: the whole interaction is "click the
 * corners, then save", and `leaflet-draw` would add a dependency and its own styling to provide
 * rectangle/circle/polyline tools this page does not offer.
 *
 * The draft lives in component state until Save, so cancelling costs nothing and the map is never
 * half-written to the server. The points are validated again server-side — a click handler is
 * untrusted input.
 */

export type BoundaryPoint = [number, number];

function ClickToAdd({ onAdd }: { onAdd: (point: BoundaryPoint) => void }) {
  useMapEvents({
    click(event) {
      onAdd([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
}

export function FarmBoundaryEditor({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: BoundaryPoint[] | null;
  saving: boolean;
  onSave: (points: BoundaryPoint[]) => void;
  onCancel: () => void;
}) {
  const { t, font, isRTL } = useLanguage();
  const c = useTokens();
  const f = t.settings.farms;

  const [points, setPoints] = useState<BoundaryPoint[]>(initial ?? []);

  // Fixed at mount: MapContainer only reads `center` on first render, so deriving it from the
  // changing point list would be misleading rather than useful.
  const [center] = useState<[number, number]>(() =>
    initial && initial.length > 0
      ? [
          initial.reduce((sum, point) => sum + point[0], 0) / initial.length,
          initial.reduce((sum, point) => sum + point[1], 0) / initial.length,
        ]
      : [PLOT.center.lat, PLOT.center.lng],
  );

  const addPoint = (point: BoundaryPoint) => setPoints((current) => [...current, point]);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="rounded-lg w-full p-6 relative"
        style={{ maxWidth: 760, background: c.card, border: `1px solid ${c.border}` }}
      >
        <button
          type="button"
          aria-label={t.common.close}
          onClick={onCancel}
          className="absolute top-4 transition-colors"
          style={{ [isRTL ? "left" : "right"]: 16, color: c.sec }}
        >
          <X size={18} strokeWidth={1.5} />
        </button>

        <h3 className="text-[18px] mb-1" style={{ fontFamily: font, fontWeight: 500, color: c.text }}>
          {f.boundaryTitle}
        </h3>
        <p className="text-[12px] mb-4" style={{ fontFamily: font, color: c.sec }}>
          {f.boundaryHint}
        </p>

        <div
          className="rounded-lg overflow-hidden"
          style={{ border: `1px solid ${c.border}`, height: 380, cursor: "crosshair" }}
        >
          <MapContainer
            center={center}
            zoom={PLOT.zoom}
            maxZoom={MAP_MAX_ZOOM}
            scrollWheelZoom={false}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} maxZoom={MAP_MAX_ZOOM} />

            <ClickToAdd onAdd={addPoint} />

            {points.length >= 3 && (
              <Polygon
                positions={points}
                pathOptions={{ color: c.green, weight: 2, fillColor: c.green, fillOpacity: 0.2 }}
              />
            )}

            {points.map((point, index) => (
              <CircleMarker
                key={`${point[0]}:${point[1]}:${index}`}
                center={point}
                radius={5}
                pathOptions={{ color: c.card, weight: 2, fillColor: c.green, fillOpacity: 1 }}
              />
            ))}
          </MapContainer>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <span className="text-[12px]" style={{ fontFamily: "JetBrains Mono", color: c.sec }}>
            {points.length} {f.points}
          </span>

          <button
            type="button"
            onClick={() => setPoints((current) => current.slice(0, -1))}
            disabled={points.length === 0}
            className="text-[12px] underline underline-offset-2 disabled:opacity-40"
            style={{ fontFamily: font, color: c.text }}
          >
            {f.undo}
          </button>

          <button
            type="button"
            onClick={() => setPoints([])}
            disabled={points.length === 0}
            className="text-[12px] underline underline-offset-2 disabled:opacity-40"
            style={{ fontFamily: font, color: c.text }}
          >
            {f.clear}
          </button>

          <div className="ms-auto flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2 rounded-full text-[13px]"
              style={{ border: `1px solid ${c.border}`, fontFamily: font, color: c.text }}
            >
              {f.cancel}
            </button>

            <button
              type="button"
              onClick={() => onSave(points)}
              disabled={points.length < 3 || saving}
              className="px-5 py-2 rounded-full text-[13px] text-white disabled:opacity-40"
              style={{ background: c.green, fontFamily: font, fontWeight: 500 }}
            >
              {f.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
