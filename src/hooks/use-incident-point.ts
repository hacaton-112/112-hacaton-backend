import { useCallback, useEffect, useRef, useState } from "react";

import type { GeoPoint, IncidentLocationFill } from "../contracts/geo";
import { messageFrom } from "../lib/error-message";
import {
  formatCoordinate,
  formatIncidentAddress,
} from "../services/incident-location";
import { scenarioAuthoringService } from "../services/scenario-authoring.service";
import { useMapWindowStore } from "../stores/map-window.store";

export type IncidentPointStatus =
  | { state: "idle" }
  | { state: "resolving" }
  | { state: "resolved"; label: string }
  | { state: "failed"; message: string };

export interface IncidentPointState {
  point?: GeoPoint;
  status: IncidentPointStatus;
  /** Последняя подстановка в карточку: форма применяет её один раз. */
  fill?: IncidentLocationFill;
  select: (point: GeoPoint) => void;
}

interface Selection {
  /** Звонок, в котором отмечена точка: у другого звонка своей точки ещё нет. */
  sessionId: string;
  point: GeoPoint;
  status: IncidentPointStatus;
  fill: IncidentLocationFill;
}

const IDLE: IncidentPointStatus = { state: "idle" };

/** Запасной текст, если ошибка пришла без сообщения. */
const ADDRESS_ERROR = "Не удалось определить адрес";

/**
 * Место происшествия, отмеченное оператором на карте.
 *
 * Координаты попадают в карточку сразу, адрес — когда backend его определит.
 * Ответ на устаревший клик отбрасывается: оператор мог уже отметить другую
 * точку, и адрес прошлой не должен её перезаписать.
 */
export function useIncidentPoint(
  trainingSessionId?: string,
): IncidentPointState {
  const [selection, setSelection] = useState<Selection>();
  const revisionRef = useRef(0);

  useEffect(() => {
    // Окно карты живёт отдельно и о смене звонка узнаёт только отсюда.
    revisionRef.current += 1;
    useMapWindowStore.getState().setSelectedPoint(null);
  }, [trainingSessionId]);

  const select = useCallback(
    (point: GeoPoint) => {
      if (!trainingSessionId) return;

      const revision = ++revisionRef.current;
      const coordinates = {
        latitude: formatCoordinate(point.latitude),
        longitude: formatCoordinate(point.longitude),
      };

      setSelection({
        sessionId: trainingSessionId,
        point,
        status: { state: "resolving" },
        fill: { revision: revision * 2, ...coordinates },
      });
      useMapWindowStore.getState().setSelectedPoint(point);

      scenarioAuthoringService
        .reverseGeocode({ ...point, trainingSessionId })
        .then((address) => {
          if (revision !== revisionRef.current) return;

          setSelection({
            sessionId: trainingSessionId,
            point,
            status: { state: "resolved", label: address.displayName },
            fill: {
              revision: revision * 2 + 1,
              ...coordinates,
              addressText: formatIncidentAddress(address),
            },
          });
        })
        .catch((error: unknown) => {
          if (revision !== revisionRef.current) return;

          setSelection((current) =>
            current
              ? {
                  ...current,
                  status: {
                    state: "failed",
                    message: messageFrom(error, ADDRESS_ERROR),
                  },
                }
              : current,
          );
        });
    },
    [trainingSessionId],
  );

  const current =
    selection && selection.sessionId === trainingSessionId
      ? selection
      : undefined;

  return {
    point: current?.point,
    status: current?.status ?? IDLE,
    fill: current?.fill,
    select,
  };
}
