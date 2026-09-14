import {
  type GeoJSONSource,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  ScaleControl,
} from "maplibre-gl";
import {
  Card,
  Code,
  Flex,
  Grid,
  SegmentedControl,
  Text,
} from "@bolid-ui/themes";
import { useEffect, useRef, useState } from "react";

import { env } from "../../config/env";
import { INCIDENT_ZOOM, MOSCOW } from "../../config/map";
import { cn } from "../../lib/cn";
import { createCircleZone } from "../map/geo-circle";
import { useFieldError } from "./scenario-form-context";
import { FieldError, Loadable } from "./scenario-form-fields";
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
  // Отметки на карте проверяются вместе: попадание точки в область зависит от
  // обеих, поэтому любой клик снимает обе ошибки.
  const pointError = useFieldError("location.exactPoint", true);
  const centerError = useFieldError("location.locatorCenter", true);
  const invalid = pointError.error ?? centerError.error;

  useEffect(() => {
    onSelectRef.current = (target, coordinates) => {
      pointError.clear();
      centerError.clear();
      onSelect(target, coordinates);
    };
  }, [onSelect, pointError, centerError]);

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

      // Координаты задаются до addTo: addTo сразу пересчитывает позицию
      // маркера, и без setLngLat maplibre падает на чтении lngLat.lng.
      if (hasLocator) {
        const lngLat: [number, number] = [locatorCenter[1], locatorCenter[0]];

        if (locatorMarkerRef.current) {
          locatorMarkerRef.current.setLngLat(lngLat);
        } else {
          locatorMarkerRef.current = new Marker({
            color: "#1684e8",
            scale: 0.75,
          })
            .setLngLat(lngLat)
            .addTo(map);
        }
      } else {
        locatorMarkerRef.current?.remove();
        locatorMarkerRef.current = null;
      }

      if (hasSelectedCoordinates(exactPoint)) {
        const lngLat: [number, number] = [exactPoint[1], exactPoint[0]];

        if (incidentMarkerRef.current) {
          incidentMarkerRef.current.setLngLat(lngLat);
        } else {
          incidentMarkerRef.current = new Marker({ color: "#dc3f45" })
            .setLngLat(lngLat)
            .addTo(map);
        }
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
    <Grid gap="3">
      <Loadable>
        <SegmentedControl.Root
          value={target}
          onValueChange={(next) => setTarget(next as ScenarioLocationTarget)}
          aria-label="Что отметить на карте"
          className="justify-self-start"
        >
          <SegmentedControl.Item value="incident">
            Точка происшествия
          </SegmentedControl.Item>
          <SegmentedControl.Item value="locator">
            Центр области
          </SegmentedControl.Item>
        </SegmentedControl.Root>
      </Loadable>

      <Loadable>
        <Card
          size="1"
          variant="surface"
          className={cn(
            "relative h-[360px] p-0!",
            invalid !== undefined &&
              "outline-1 outline-(--red-a11) outline-solid",
          )}
          {...(pointError.error === undefined
            ? centerError.anchor
            : pointError.anchor)}
        >
          <div ref={containerRef} className="h-full w-full" />
          <Card
            size="1"
            className="pointer-events-none absolute! top-3 left-3 max-w-[260px] [--card-background-color:var(--color-panel-solid)]"
          >
            <Text size="1">
              Клик задаёт:{" "}
              {target === "incident" ? "точку происшествия" : "центр области"}
            </Text>
          </Card>
          {failed && (
            <Flex
              justify="center"
              px="3"
              py="2"
              className="bg-grayA-3 pointer-events-none absolute inset-x-0 bottom-0"
            >
              <Text size="1" color="gray">
                Подложка карты недоступна — координаты можно ввести вручную
              </Text>
            </Flex>
          )}
        </Card>
      </Loadable>

      <Grid gap="1" columns={{ initial: "1", sm: "2" }}>
        <Text size="1" color="gray">
          Точка: <Code variant="ghost">{formatCoordinates(exactPoint)}</Code>
        </Text>
        <Text size="1" color="gray">
          Центр области:{" "}
          <Code variant="ghost">{formatCoordinates(locatorCenter)}</Code>
        </Text>
      </Grid>
      <FieldError error={pointError.error} />
      {centerError.error !== pointError.error && (
        <FieldError error={centerError.error} />
      )}
    </Grid>
  );
}
