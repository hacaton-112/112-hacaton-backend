import {
  Badge,
  Card,
  DataList,
  Flex,
  Heading,
  Spinner,
  Text,
} from "@bolid-ui/themes";
import { MapPin } from "lucide-react";

import { MOSCOW } from "../../config/map";
import type { CallState } from "../../hooks/use-call";
import type { IncidentLocation } from "../map/incident-map";

interface CallCardProps {
  state: CallState;
  incident?: IncidentLocation;
  isResolvingAddress: boolean;
  callerNumber?: string;
  startedAt?: Date;
}

const formatCoordinates = ({ latitude, longitude }: IncidentLocation) =>
  `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

const formatTime = (date: Date) =>
  date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export function CallCard({
  state,
  incident,
  isResolvingAddress,
  callerNumber,
  startedAt,
}: CallCardProps) {
  return (
    <Card size="2" className="min-w-0 flex-1">
      <Flex direction="column" gap="3">
        <Flex align="center" gap="2">
          <Heading size="3">Данные вызова</Heading>
          {incident ? (
            <Badge color="green" variant="soft">
              Адрес определён
            </Badge>
          ) : isResolvingAddress ? (
            <Badge color="amber" variant="soft">
              <Spinner size="1" />
              Определение адреса
            </Badge>
          ) : (
            <Badge color="gray" variant="soft">
              Нет данных
            </Badge>
          )}
        </Flex>

        {state === "idle" ? (
          <Text size="2" color="gray">
            Вызовов нет. Карта показывает {MOSCOW.name}; после определения
            адреса она приблизится к точке происшествия.
          </Text>
        ) : (
          <DataList.Root orientation="horizontal" size="2">
            <DataList.Item>
              <DataList.Label minWidth="110px">Номер</DataList.Label>
              <DataList.Value>{callerNumber ?? "—"}</DataList.Value>
            </DataList.Item>
            <DataList.Item>
              <DataList.Label minWidth="110px">Город</DataList.Label>
              <DataList.Value>{MOSCOW.name}</DataList.Value>
            </DataList.Item>
            <DataList.Item>
              <DataList.Label minWidth="110px">Адрес</DataList.Label>
              <DataList.Value>
                {incident ? (
                  <Flex align="center" gap="1">
                    <MapPin size={14} aria-hidden />
                    {incident.address}
                  </Flex>
                ) : (
                  <Text color="gray">
                    {isResolvingAddress ? "Определяется…" : "—"}
                  </Text>
                )}
              </DataList.Value>
            </DataList.Item>
            <DataList.Item>
              <DataList.Label minWidth="110px">Координаты</DataList.Label>
              <DataList.Value>
                {incident ? (
                  formatCoordinates(incident)
                ) : (
                  <Text color="gray">—</Text>
                )}
              </DataList.Value>
            </DataList.Item>
            <DataList.Item>
              <DataList.Label minWidth="110px">Поступил</DataList.Label>
              <DataList.Value>
                {startedAt ? formatTime(startedAt) : "—"}
              </DataList.Value>
            </DataList.Item>
          </DataList.Root>
        )}
      </Flex>
    </Card>
  );
}
