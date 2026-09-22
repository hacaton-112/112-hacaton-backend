import { Button, Dialog, Spinner, Text } from "@bolid-ui/themes";
import { AlertTriangle, Crosshair, MapPin } from "lucide-react";
import { useState } from "react";

import { MOSCOW } from "../../config/map";
import type { GeoPoint, IncidentLocation } from "../../contracts/geo";
import type { IncidentPointStatus } from "../../hooks/use-incident-point";
import { IncidentMap } from "../map/incident-map";

interface IncidentMapDialogProps {
  incident?: IncidentLocation;
  selectedPoint?: GeoPoint;
  status: IncidentPointStatus;
  required: boolean;
  onSelectPoint?: (point: GeoPoint) => void;
}

/**
 * Карта открывается поверх карточки, как отдельный рабочий инструмент.
 * Это одинаково работает в Tauri и в обычном браузере и не зависит от
 * синхронизации состояния между окнами.
 */
export function IncidentMapDialog({
  incident,
  selectedPoint,
  status,
  required,
  onSelectPoint,
}: IncidentMapDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <button
          type="button"
          className="arm112-map-button"
          disabled={!onSelectPoint}
          title={
            onSelectPoint
              ? "Отметить место происшествия на карте"
              : "Карта доступна во время активного вызова"
          }
        >
          <MapPin size={14} aria-hidden />
          {selectedPoint ? "Изменить точку" : "Отметить на карте"}
        </button>
      </Dialog.Trigger>

      <Dialog.Content
        maxWidth="1000px"
        className="w-[calc(100vw-2rem)] sm:max-w-[1000px]"
      >
        <Dialog.Title>Место происшествия</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="3">
          Нажмите на карту в предполагаемом месте. Координаты сохранятся сразу,
          город и улица заполнятся после определения адреса.
        </Dialog.Description>

        <div className="arm112-map-dialog-map">
          <IncidentMap
            city={MOSCOW}
            incident={incident}
            selectedPoint={selectedPoint}
            onSelectPoint={onSelectPoint}
            className="h-full"
          />
        </div>

        <PointStatus
          selectable={Boolean(onSelectPoint)}
          hasPoint={Boolean(selectedPoint)}
          status={status}
          required={required}
        />

        <div className="mt-4 flex justify-end">
          <Dialog.Close>
            <Button type="button" variant="soft" color="gray">
              Готово
            </Button>
          </Dialog.Close>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function PointStatus({
  selectable,
  hasPoint,
  status,
  required,
}: {
  selectable: boolean;
  hasPoint: boolean;
  status: IncidentPointStatus;
  required: boolean;
}) {
  if (!selectable && status.state === "idle") return null;

  const content = (() => {
    switch (status.state) {
      case "resolving":
        return (
          <>
            <Spinner size="1" />
            <span>Определяем город и улицу…</span>
          </>
        );
      case "resolved":
        return (
          <>
            <MapPin
              size={15}
              className="shrink-0 text-(--green-10)"
              aria-hidden
            />
            <span>{status.label}</span>
          </>
        );
      case "failed":
        return (
          <>
            <AlertTriangle
              size={15}
              className="shrink-0 text-(--amber-11)"
              aria-hidden
            />
            <span>
              {status.message}. Координаты сохранены, адрес можно ввести
              вручную.
            </span>
          </>
        );
      case "idle":
        return (
          <>
            <Crosshair
              size={15}
              className={required ? "text-(--red-9)" : "text-(--gray-11)"}
              aria-hidden
            />
            <span>
              {hasPoint
                ? "Нажмите на карту, чтобы перенести точку"
                : `${required ? "Обязательно: " : ""}отметьте место происшествия`}
            </span>
          </>
        );
    }
  })();

  return (
    <Text
      as="div"
      size="2"
      role="status"
      aria-live="polite"
      className="arm112-map-status"
    >
      {content}
    </Text>
  );
}
