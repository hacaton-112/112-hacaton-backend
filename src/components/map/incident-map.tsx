import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

import { env } from "../../config/env";
import { INCIDENT_ZOOM, type CityPreset } from "../../config/map";

export interface IncidentLocation {
  longitude: number;
  latitude: number;
  address: string;
}

interface IncidentMapProps {
  city: CityPreset;
  /** Появляется, когда адрес вызова определён: карта долетает до точки. */
  incident?: IncidentLocation;
  className?: string;
}

export function IncidentMap({ city, incident, className }: IncidentMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap>(null);
  const markerRef = useRef<Marker>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: env.mapStyleUrl,
      center: city.center,
      zoom: city.zoom,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    // Отладочный доступ к карте из консоли и e2e-проверок; в прод-сборку не попадает.
    if (import.meta.env.DEV) {
      (globalThis as unknown as { __incidentMap?: MapLibreMap }).__incidentMap =
        map;
    }

    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new ScaleControl({ maxWidth: 120, unit: "metric" }),
      "bottom-left",
    );
    // Подложка живёт по сети; без неё карта остаётся серой, поэтому говорим об этом прямо.
    map.on("error", () => setFailed(true));

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
  }, [city]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!incident) {
      markerRef.current?.remove();
      markerRef.current = null;
      map.easeTo({ center: city.center, zoom: city.zoom });
      return;
    }

    const position: [number, number] = [incident.longitude, incident.latitude];

    if (markerRef.current) {
      markerRef.current.setLngLat(position);
    } else {
      // Свой элемент вместо стандартной «капли»: цвет тянется из темы, а
      // в атрибут fill у встроенного маркера CSS-переменную подставить нельзя.
      const element = document.createElement("div");
      element.className =
        "size-3.5 rounded-full bg-accent-9 ring-3 ring-accent-a5 shadow-3";
      markerRef.current = new Marker({ element })
        .setLngLat(position)
        .addTo(map);
    }

    map.flyTo({ center: position, zoom: INCIDENT_ZOOM, speed: 0.8 });
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
