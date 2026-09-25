import {
  type GeoJSONSource,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "../../lib/map-worker";

import {
  hasWebGl,
  isMissingTileError,
  mapFailureText,
} from "../../lib/map-errors";

const WEBGL_MISSING =
  "Браузер не даёт WebGL — карта не рисуется. Включите аппаратное ускорение в настройках браузера или откройте тренажёр на этой машине.";
import { useEffect, useRef, useState } from "react";

import { env } from "../../config/env";
import { INCIDENT_ZOOM, type CityPreset } from "../../config/map";
import type { GeoPoint, IncidentLocation } from "../../contracts/geo";
import { createCircleZone } from "./geo-circle";

const ZONE_RADIUS_METERS = 400;
const ZONE_SOURCE_ID = "incident-zone";
const ZONE_FILL_LAYER_ID = "incident-zone-fill";
const ZONE_OUTLINE_LAYER_ID = "incident-zone-outline";

interface IncidentMapProps {
  city: CityPreset;
  /** Появляется, когда адрес вызова определён: карта показывает примерную зону. */
  incident?: IncidentLocation;
  className?: string;
  controls?: boolean;
  /** Место происшествия, которое оператор отметил сам. */
  selectedPoint?: GeoPoint;
  /** Передан — клик по карте отмечает точку; без него карта только показывает. */
  onSelectPoint?: (point: GeoPoint) => void;
}

export function IncidentMap({
  city,
  incident,
  className,
  controls = true,
  selectedPoint,
  onSelectPoint,
}: IncidentMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap>(null);
  const markerRef = useRef<Marker>(null);
  const onSelectPointRef = useRef(onSelectPoint);
  const [error, setError] = useState<string | null>(null);
  // Поддержку WebGL спрашивают один раз при создании состояния: меняться за
  // жизнь страницы ей неоткуда, а в эффекте это была бы лишняя перерисовка.
  const [webGl] = useState(hasWebGl);
  const failure = webGl ? error : WEBGL_MISSING;
  const selectable = Boolean(onSelectPoint);

  useEffect(() => {
    onSelectPointRef.current = onSelectPoint;
  }, [onSelectPoint]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!webGl) return;

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
    // Без подложки карта остаётся серой, поэтому о сбое говорим прямо. Но
    // отсутствующий тайл за пределами детализации — не сбой (см. isMissingTileError).
    map.on("error", (event) => {
      if (!isMissingTileError(event.error))
        setError(mapFailureText(event.error));
    });
    // Обработчик один на всю жизнь карты: отмечать ли точку, решает текущий
    // колбэк, а не пересоздание карты.
    map.on("click", (event) =>
      onSelectPointRef.current?.({
        latitude: event.lngLat.lat,
        longitude: event.lngLat.lng,
      }),
    );

    // Контейнер меняет размер вместе с раскладкой, а не только с окном.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [city, controls, webGl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.getCanvas().style.cursor = selectable ? "crosshair" : "";
  }, [selectable, city, controls]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!selectedPoint) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    // Координаты задаются до addTo: addTo сразу пересчитывает позицию
    // маркера, и без setLngLat maplibre падает на чтении lngLat.lng.
    const lngLat: [number, number] = [
      selectedPoint.longitude,
      selectedPoint.latitude,
    ];

    if (markerRef.current) {
      markerRef.current.setLngLat(lngLat);
    } else {
      markerRef.current = new Marker({ color: "#dc3f45" })
        .setLngLat(lngLat)
        .addTo(map);
    }
  }, [selectedPoint, city, controls]);

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
      {failure && (
        <div className="text-1 bg-grayA-3 text-gray-11 pointer-events-none absolute inset-x-0 bottom-0 px-3 py-2 text-center">
          {failure}
        </div>
      )}
    </div>
  );
}
