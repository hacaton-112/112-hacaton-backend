import {
  type GeoJSONSource,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import { env } from "../../config/env";
import { INCIDENT_ZOOM, MOSCOW } from "../../config/map";
import { createCircleZone } from "../map/geo-circle";
import {
  formatCoordinates,
  hasSelectedCoordinates,
  type ScenarioCoordinates,
} from "./scenario-location-values";

const RANGE_SOURCE_ID = "scenario-location-range";
const RANGE_FILL_LAYER_ID = "scenario-location-range-fill";
const RANGE_OUTLINE_LAYER_ID = "scenario-location-range-outline";

export type ScenarioLocationTarget = "incident" | "locator";

interface ScenarioLocationMapProps {
  exactPoint: ScenarioCoordinates;
  locatorCenter: ScenarioCoordinates;
  radiusMeters: number;
  onSelect: (
    target: ScenarioLocationTarget,
    coordinates: ScenarioCoordinates,
  ) => void;
}

const emptyFeatureCollection = () => ({
  type: "FeatureCollection" as const,
  features: [],
});

export function ScenarioLocationMap({
  exactPoint,
  locatorCenter,
  radiusMeters,
  onSelect,
}: ScenarioLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap>(null);
  const incidentMarkerRef = useRef<Marker>(null);
  const locatorMarkerRef = useRef<Marker>(null);
  const onSelectRef = useRef(onSelect);
  const [target, setTarget] = useState<ScenarioLocationTarget>("incident");
  const targetRef = useRef(target);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    if (!containerRef.current) return;

    const initialCoordinates: [number, number] = hasSelectedCoordinates(
      locatorCenter,
    )
      ? [locatorCenter[1], locatorCenter[0]]
      : MOSCOW.center;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: env.mapStyleUrl,
      center: initialCoordinates,
      zoom: hasSelectedCoordinates(locatorCenter)
        ? INCIDENT_ZOOM - 1.5
        : MOSCOW.zoom,
      attributionControl: false,
    });
    mapRef.current = map;
    map.getCanvas().style.cursor = "crosshair";
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new ScaleControl({ maxWidth: 120, unit: "metric" }),
      "bottom-left",
    );

    const handleClick = (event: { lngLat: { lat: number; lng: number } }) => {
      const coordinates: ScenarioCoordinates = [
        Number(event.lngLat.lat.toFixed(6)),
        Number(event.lngLat.lng.toFixed(6)),
      ];
      onSelectRef.current(targetRef.current, coordinates);
      map.easeTo({
        center: [coordinates[1], coordinates[0]],
        zoom: Math.max(map.getZoom(), INCIDENT_ZOOM - 1.5),
      });
    };
    map.on("click", handleClick);
    map.on("error", () => setFailed(true));

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      incidentMarkerRef.current?.remove();
      locatorMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // Initial coordinates only set the first viewport. Subsequent changes are
    // rendered by the dedicated effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const renderSelection = () => {
      const hasLocator = hasSelectedCoordinates(locatorCenter);
      const range = hasLocator
        ? createCircleZone(
            {
              latitude: locatorCenter[0],
              longitude: locatorCenter[1],
            },
            radiusMeters,
          )
        : emptyFeatureCollection();
      const source = map.getSource(RANGE_SOURCE_ID) as
        GeoJSONSource | undefined;

      if (source) {
        source.setData(range);
      } else {
        map.addSource(RANGE_SOURCE_ID, { type: "geojson", data: range });
        map.addLayer({
          id: RANGE_FILL_LAYER_ID,
          type: "fill",
          source: RANGE_SOURCE_ID,
          paint: { "fill-color": "#1684e8", "fill-opacity": 0.2 },
        });
        map.addLayer({
          id: RANGE_OUTLINE_LAYER_ID,
          type: "line",
          source: RANGE_SOURCE_ID,
          paint: {
            "line-color": "#0b75d1",
            "line-opacity": 0.9,
            "line-width": 2,
          },
        });
      }

      if (hasLocator) {
        if (!locatorMarkerRef.current) {
          locatorMarkerRef.current = new Marker({
            color: "#1684e8",
            scale: 0.75,
          }).addTo(map);
        }
        locatorMarkerRef.current.setLngLat([
          locatorCenter[1],
          locatorCenter[0],
        ]);
      } else {
        locatorMarkerRef.current?.remove();
        locatorMarkerRef.current = null;
      }

      if (hasSelectedCoordinates(exactPoint)) {
        if (!incidentMarkerRef.current) {
          incidentMarkerRef.current = new Marker({ color: "#dc3f45" }).addTo(
            map,
          );
        }
        incidentMarkerRef.current.setLngLat([exactPoint[1], exactPoint[0]]);
      } else {
        incidentMarkerRef.current?.remove();
        incidentMarkerRef.current = null;
      }
    };

    if (map.isStyleLoaded()) renderSelection();
    else map.once("load", renderSelection);

    return () => {
      map.off("load", renderSelection);
    };
  }, [exactPoint, locatorCenter, radiusMeters]);

  return (
    <div className="grid gap-3">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Что отметить на карте"
      >
        <SelectionButton
          active={target === "incident"}
          onClick={() => setTarget("incident")}
        >
          Точка происшествия
        </SelectionButton>
        <SelectionButton
          active={target === "locator"}
          onClick={() => setTarget("locator")}
        >
          Центр области
        </SelectionButton>
      </div>

      <div className="border-grayA-6 relative h-[360px] overflow-hidden rounded-lg border">
        <div ref={containerRef} className="h-full w-full" />
        <div className="bg-panel/90 text-gray-12 pointer-events-none absolute top-3 left-3 max-w-[260px] rounded-md px-3 py-2 text-xs shadow-sm backdrop-blur">
          Клик задаёт:{" "}
          {target === "incident" ? "точку происшествия" : "центр области"}
        </div>
        {failed && (
          <div className="text-1 bg-grayA-3 text-gray-11 pointer-events-none absolute inset-x-0 bottom-0 px-3 py-2 text-center">
            Подложка карты недоступна — координаты можно ввести вручную
          </div>
        )}
      </div>

      <div className="text-gray-11 grid gap-1 text-xs sm:grid-cols-2">
        <span>
          Точка: <code>{formatCoordinates(exactPoint)}</code>
        </span>
        <span>
          Центр области: <code>{formatCoordinates(locatorCenter)}</code>
        </span>
      </div>
    </div>
  );
}

function SelectionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={
        active
          ? "bg-blue-9 rounded-md px-3 py-2 text-xs font-medium text-white"
          : "bg-grayA-3 text-gray-11 hover:bg-grayA-4 rounded-md px-3 py-2 text-xs font-medium"
      }
      onClick={onClick}
    >
      {children}
    </button>
  );
}
