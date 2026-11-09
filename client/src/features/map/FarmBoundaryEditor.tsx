import { useEffect, useId, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polygon,
  CircleMarker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { X } from "lucide-react";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useTokens } from "@/app/hooks/useTokens";
import {
  MAP_ATTRIBUTION,
  MAP_MAX_ZOOM,
  MAP_TILE_NATIVE_ZOOM,
  MAP_TILE_URL,
  PLOT,
} from "../demoPlot/config";
import {
  MAX_ZONE_DIMENSION_METERS,
  openBoundary,
  zoneAreaSquareMeters,
  zoneBoundarySchema,
} from "@semico/shared";
import {
  boundaryDimensions,
  farmMapCenter,
  zoneRectangles,
  type LatLng,
} from "./geometry";

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

function ClickToAdd({
  onAdd,
  onCenter,
}: {
  onAdd: (point: BoundaryPoint) => void;
  onCenter: (point: BoundaryPoint) => void;
}) {
  useMapEvents({
    click(event) {
      onAdd([event.latlng.lat, event.latlng.lng]);
    },
    moveend(event) {
      const center = event.target.wrapLatLng(event.target.getCenter());
      onCenter([center.lat, center.lng]);
    },
  });
  return null;
}

function FitInitialShape({ points }: { points: BoundaryPoint[] }) {
  const map = useMap();
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      map.invalidateSize();
      if (points.length >= 3)
        map.fitBounds(points, {
          padding: [24, 24],
          maxZoom: MAP_MAX_ZOOM,
          animate: false,
        });
    });
    return () => cancelAnimationFrame(frame);
  }, [map, points]);
  return null;
}

export function FarmBoundaryEditor({
  initial,
  saving,
  onSave,
  onCancel,
  title,
  hint,
  zoneMode = false,
  initialCenter,
  onReset,
  error,
}: {
  initial: BoundaryPoint[] | null;
  saving: boolean;
  onSave: (points: BoundaryPoint[]) => void;
  onCancel: () => void;
  title?: string;
  hint?: string;
  zoneMode?: boolean;
  initialCenter?: LatLng;
  onReset?: () => void;
  error?: string | null;
}) {
  const { t, font, isRTL } = useLanguage();
  const c = useTokens();
  const f = t.settings.farms;

  const initialPoints = useRef(openBoundary(initial ?? []));
  const [points, setPoints] = useState<BoundaryPoint[]>(initialPoints.current);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [dimensions, setDimensions] = useState(() => {
    const size = boundaryDimensions(initialPoints.current);
    return {
      width: String(Math.round(size.widthMeters * 100) / 100),
      height: String(Math.round(size.heightMeters * 100) / 100),
    };
  });
  const [rectanglePending, setRectanglePending] = useState(false);
  const [mapCenter, setMapCenter] = useState<LatLng>(() =>
    initial?.length
      ? farmMapCenter(undefined, initial)
      : farmMapCenter(initialCenter),
  );
  const width = Number(dimensions.width);
  const height = Number(dimensions.height);
  const validDimensions =
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= 1 &&
    height >= 1 &&
    width <= MAX_ZONE_DIMENSION_METERS &&
    height <= MAX_ZONE_DIMENSION_METERS;
  const validShape = zoneMode
    ? zoneBoundarySchema.safeParse(points).success
    : points.length >= 3;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => {
    if (!zoneMode || points.length < 3) return;
    const size = boundaryDimensions(points);
    setDimensions({
      width: String(Math.round(size.widthMeters * 100) / 100),
      height: String(Math.round(size.heightMeters * 100) / 100),
    });
    setRectanglePending(false);
  }, [points, zoneMode]);

  // Fixed at mount: MapContainer only reads `center` on first render, so deriving it from the
  // changing point list would be misleading rather than useful.
  const [center] = useState<[number, number]>(() =>
    initial && initial.length > 0
      ? [
          initial.reduce((sum, point) => sum + point[0], 0) / initial.length,
          initial.reduce((sum, point) => sum + point[1], 0) / initial.length,
        ]
      : farmMapCenter(initialCenter),
  );

  const addPoint = (point: BoundaryPoint) => {
    if (saving) return;
    setPoints((current) =>
      current.length < (zoneMode ? 64 : 300) ? [...current, point] : current,
    );
    setRectanglePending(false);
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      dir={isRTL ? "rtl" : "ltr"}
      className="fixed inset-0 m-auto p-0 border-0 rounded-lg backdrop:bg-black/40"
      style={{
        width: "min(96vw, 900px)",
        maxHeight: "90dvh",
        background: c.card,
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onCancel();
      }}
    >
      <div
        className="rounded-lg w-full p-6 relative"
        style={{ background: c.card, border: `1px solid ${c.border}` }}
      >
        <button
          type="button"
          aria-label={t.common.close}
          onClick={onCancel}
          disabled={saving}
          className="absolute top-4 transition-colors"
          style={{ [isRTL ? "left" : "right"]: 16, color: c.sec }}
        >
          <X size={18} strokeWidth={1.5} />
        </button>

        <h3
          id={titleId}
          className="text-[18px] mb-1 pe-8"
          style={{ fontFamily: font, fontWeight: 500, color: c.text }}
        >
          {title ?? f.boundaryTitle}
        </h3>
        <p
          className="text-[12px] mb-4"
          style={{ fontFamily: font, color: c.sec }}
        >
          {hint ?? f.boundaryHint}
        </p>

        {zoneMode && (
          <div className="mb-4">
            <div className="grid grid-cols-2 gap-3">
              {(["width", "height"] as const).map((axis) => (
                <label key={axis} className="text-xs" style={{ color: c.sec }}>
                  <span className="block mb-1">
                    {axis === "width" ? f.widthMeters : f.heightMeters}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={MAX_ZONE_DIMENSION_METERS}
                    step="0.1"
                    value={dimensions[axis]}
                    disabled={saving}
                    onChange={(event) => {
                      setDimensions((current) => ({
                        ...current,
                        [axis]: event.target.value,
                      }));
                      setRectanglePending(true);
                    }}
                    className="w-full rounded-lg p-2 bg-transparent"
                    dir="ltr"
                    style={{ border: `1px solid ${c.border}`, color: c.text }}
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={!validDimensions || saving}
              onClick={() => {
                setPoints(
                  zoneRectangles(
                    1,
                    { lat: mapCenter[0], lng: mapCenter[1] },
                    { widthMeters: width, heightMeters: height },
                  )[0].ring,
                );
                setRectanglePending(false);
              }}
              className="mt-3 rounded-full px-4 py-2 text-xs disabled:opacity-40"
              style={{ background: c.activeBg, color: c.text }}
            >
              {f.applyRectangle}
            </button>
            <p className="mt-2 text-xs" style={{ color: c.sec }}>
              {f.areaSquareMeters}: {zoneAreaSquareMeters(points).toFixed(1)}
            </p>
            {points.length >= 3 && !validShape && (
              <p
                role="alert"
                className="mt-2 text-xs"
                style={{ color: c.crit }}
              >
                {f.invalidZoneShape}
              </p>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="mb-3 text-sm" style={{ color: c.crit }}>
            {error}
          </p>
        )}

        <div
          className="rounded-lg overflow-hidden"
          style={{
            border: `1px solid ${c.border}`,
            height: 380,
            cursor: "crosshair",
          }}
        >
          <MapContainer
            center={center}
            zoom={PLOT.zoom}
            maxZoom={MAP_MAX_ZOOM}
            scrollWheelZoom={false}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              url={MAP_TILE_URL}
              attribution={MAP_ATTRIBUTION}
              maxZoom={MAP_MAX_ZOOM}
              maxNativeZoom={MAP_TILE_NATIVE_ZOOM}
            />

            <FitInitialShape points={initialPoints.current} />
            <ClickToAdd onAdd={addPoint} onCenter={setMapCenter} />

            {points.length >= 3 && (
              <Polygon
                positions={points}
                interactive={false}
                pathOptions={{
                  color: c.green,
                  weight: 2,
                  fillColor: c.green,
                  fillOpacity: 0.2,
                }}
              />
            )}

            {points.map((point, index) => (
              <CircleMarker
                key={`${point[0]}:${point[1]}:${index}`}
                center={point}
                radius={5}
                interactive={false}
                pathOptions={{
                  color: c.card,
                  weight: 2,
                  fillColor: c.green,
                  fillOpacity: 1,
                }}
              />
            ))}
          </MapContainer>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <span
            className="text-[12px]"
            style={{ fontFamily: "JetBrains Mono", color: c.sec }}
          >
            {points.length} {f.points}
          </span>

          <button
            type="button"
            onClick={() => setPoints((current) => current.slice(0, -1))}
            disabled={points.length === 0 || saving}
            className="text-[12px] underline underline-offset-2 disabled:opacity-40"
            style={{ fontFamily: font, color: c.text }}
          >
            {f.undo}
          </button>

          <button
            type="button"
            onClick={() => setPoints([])}
            disabled={points.length === 0 || saving}
            className="text-[12px] underline underline-offset-2 disabled:opacity-40"
            style={{ fontFamily: font, color: c.text }}
          >
            {f.clear}
          </button>

          <div className="ms-auto flex gap-3">
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                disabled={saving}
                className="text-xs underline disabled:opacity-40"
                style={{ color: c.sec }}
              >
                {f.automaticZone}
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-2 rounded-full text-[13px]"
              style={{
                border: `1px solid ${c.border}`,
                fontFamily: font,
                color: c.text,
              }}
            >
              {f.cancel}
            </button>

            <button
              type="button"
              onClick={() => onSave(points)}
              disabled={!validShape || rectanglePending || saving}
              className="px-5 py-2 rounded-full text-[13px] text-white disabled:opacity-40"
              style={{ background: c.green, fontFamily: font, fontWeight: 500 }}
            >
              {f.save}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
