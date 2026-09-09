import {
  type GeoJSONSource,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

import { env } from "../../config/env";
import { INCIDENT_ZOOM, type CityPreset } from "../../config/map";

const ZONE_RADIUS_METERS = 400;
const ZONE_SOURCE_ID = "incident-zone";
const ZONE_FILL_LAYER_ID = "incident-zone-fill";
const ZONE_OUTLINE_LAYER_ID = "incident-zone-outline";

export interface IncidentLocation {
  longitude: number;
  latitude: number;
  address: string;
}

interface IncidentMapProps {
  city: CityPreset;
  /** Появляется, когда адрес вызова определён: карта показывает примерную зону. */
  incident?: IncidentLocation;
  className?: string;
  controls?: boolean;
}

export function IncidentMap({
  city,
  incident,
  className,
  controls = true,
}: IncidentMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: env.mapStyleUrl,
      center: city.center,
      zoom: city.zoom,
      attributionControl: false,
    });
    mapRef.current = map;

    // Отладочный доступ к карте из консоли и e2e-проверок; в прод-сборку не попадает.
    if (import.meta.env.DEV) {
      (globalThis as unknown as { __incidentMap?: MapLibreMap }).__incidentMap =
        map;
    }

    if (controls) {
      map.addControl(
        new NavigationControl({ showCompass: false }),
        "top-right",
      );
      map.addControl(
        new ScaleControl({ maxWidth: 120, unit: "metric" }),
        "bottom-left",
      );
    }
    // Подложка живёт по сети; без неё карта остаётся серой, поэтому говорим об этом прямо.
    map.on("error", () => setFailed(true));

    // Контейнер меняет размер вместе с раскладкой, а не только с окном.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [city, controls]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const renderZone = () => {
      const source = map.getSource(ZONE_SOURCE_ID) as GeoJSONSource | undefined;

      if (!incident) {
        source?.setData({ type: "FeatureCollection", features: [] });
        map.easeTo({ center: city.center, zoom: city.zoom });
        return;
      }

      const zone = createCircleZone(incident, ZONE_RADIUS_METERS);

      if (source) {
        source.setData(zone);
      } else {
        map.addSource(ZONE_SOURCE_ID, { type: "geojson", data: zone });
        map.addLayer({
          id: ZONE_FILL_LAYER_ID,
          type: "fill",
          source: ZONE_SOURCE_ID,
          paint: {
            "fill-color": "#1684e8",
            "fill-opacity": 0.2,
          },
        });
        map.addLayer({
          id: ZONE_OUTLINE_LAYER_ID,
          type: "line",
          source: ZONE_SOURCE_ID,
          paint: {
            "line-color": "#0b75d1",
            "line-opacity": 0.9,
            "line-width": 2,
          },
        });
      }

      map.flyTo({
        center: [incident.longitude, incident.latitude],
        zoom: INCIDENT_ZOOM - 1.5,
        speed: 0.8,
      });
    };

    if (map.isStyleLoaded()) renderZone();
    else map.once("load", renderZone);

    return () => {
      map.off("load", renderZone);
    };
  }, [incident, city]);

  return (
    <div className={className} style={{ position: "relative" }}>
      <div ref={containerRef} className="h-full w-full" />
      {failed && (
        <div className="text-1 bg-grayA-3 text-gray-11 pointer-events-none absolute inset-x-0 bottom-0 px-3 py-2 text-center">
          Подложка карты недоступна — проверьте соединение
        </div>
      )}
    </div>
  );
}

/** Build a real geographic circle so its size remains ~400 m at every zoom. */
function createCircleZone(incident: IncidentLocation, radiusMeters: number) {
  const earthRadiusMeters = 6_371_000;
  const angularDistance = radiusMeters / earthRadiusMeters;
  const latitude = (incident.latitude * Math.PI) / 180;
  const longitude = (incident.longitude * Math.PI) / 180;
  const coordinates: [number, number][] = [];

  for (let step = 0; step <= 64; step += 1) {
    const bearing = (step / 64) * Math.PI * 2;
    const pointLatitude = Math.asin(
      Math.sin(latitude) * Math.cos(angularDistance) +
        Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const pointLongitude =
      longitude +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
        Math.cos(angularDistance) -
          Math.sin(latitude) * Math.sin(pointLatitude),
      );

    coordinates.push([
      (pointLongitude * 180) / Math.PI,
      (pointLatitude * 180) / Math.PI,
    ]);
  }

  return {
    type: "Feature" as const,
    properties: { radiusMeters },
    geometry: {
      type: "Polygon" as const,
      coordinates: [coordinates],
    },
  };
}
