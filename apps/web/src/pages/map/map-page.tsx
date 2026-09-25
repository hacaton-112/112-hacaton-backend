import { Card, Flex, Text } from "@bolid-ui/themes";
import { Crosshair, MapPin } from "lucide-react";

import { IncidentMap } from "../../components/map/incident-map";
import { MOSCOW } from "../../config/map";
import { useMapWindowStore } from "../../stores/map-window.store";

export default function MapPage() {
  const incident = useMapWindowStore((state) => state.incident);
  const isResolvingAddress = useMapWindowStore(
    (state) => state.isResolvingAddress,
  );
  const selectedPoint = useMapWindowStore((state) => state.selectedPoint);

  return (
    <Flex direction="column" className="h-screen-safe min-h-0 overflow-hidden">
      <div className="relative min-h-0 flex-1">
        <IncidentMap
          city={MOSCOW}
          incident={incident ?? undefined}
          // Точку отмечают в окне звонка; здесь она только видна.
          selectedPoint={selectedPoint ?? undefined}
          className="h-full"
        />

        <Card
          size="1"
          className="bg-background/95 absolute right-3 bottom-3 max-w-[min(360px,calc(100%-24px))] backdrop-blur"
        >
          {incident ? (
            <Flex align="start" gap="2">
              <MapPin
                className="text-accent-9 shrink-0"
                size={18}
                aria-hidden
              />
              <div className="min-w-0">
                <Text
                  size="2"
                  weight="medium"
                  truncate
                  title={incident.address}
                >
                  {incident.address}
                </Text>
                <Text size="1" color="gray" className="mt-0.5 tabular-nums">
                  {incident.latitude.toFixed(5)},{" "}
                  {incident.longitude.toFixed(5)} · радиус 400 м
                </Text>
              </div>
            </Flex>
          ) : (
            <Flex align="center" gap="2">
              <Crosshair
                className="text-gray-10 shrink-0"
                size={18}
                aria-hidden
              />
              <Text size="2" color="gray">
                {isResolvingAddress
                  ? "Определяем местоположение вызова…"
                  : "Местоположение вызова пока не определено"}
              </Text>
            </Flex>
          )}
        </Card>
      </div>
    </Flex>
  );
}
