import {
  Button,
  Card,
  Flex,
  ScrollArea,
  Separator,
  Spinner,
  Text,
} from "@bolid-ui/themes";
import { AlertTriangle, Crosshair, MapPin } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

import { IncidentMap } from "../map/incident-map";
import { MapWindowButton } from "../window/map-window-button";
import { MOSCOW } from "../../config/map";

import {
  DISPATCH_SERVICE_LABELS,
  DISPATCH_SERVICES,
  type DispatchService,
} from "../../contracts/incident";
import type { CallSnapshot } from "../../hooks/use-call";
import type { IncidentPointStatus } from "../../hooks/use-incident-point";
import type { GeoPoint } from "../../contracts/geo";
import type { ClassifierRouting } from "../../contracts/classifier";

interface ServicesProps {
  /** Выбранные службы карточки: тот же список, что уходит на backend. */
  services: DispatchService[];
  onToggleService: (service: DispatchService) => void;
  /** Рассчитаны backend и не снимаются кнопками ручного выбора. */
  requiredServices: ClassifierRouting["requiredServices"];
}

interface IncidentPointProps {
  /** Точка, отмеченная оператором: красный маркер поверх зоны автоопределения. */
  selectedPoint?: GeoPoint;
  pointStatus: IncidentPointStatus;
  /** Есть, пока карточку можно править: тогда клик по карте отмечает место. */
  onSelectPoint?: (point: GeoPoint) => void;
}

type DispatchCallPanelProps = CallSnapshot &
  ServicesProps &
  IncidentPointProps & {
    callerName: string;
    isCardReady: boolean;
    isEnding: boolean;
  };

export function DispatchCallPanel(props: DispatchCallPanelProps) {
  return (
    <aside className="dispatch-panel grid min-h-full grid-rows-[210px_263px_minmax(320px,418px)] content-start gap-4 min-[1480px]:h-full min-[1480px]:grid-cols-1 min-[1480px]:grid-rows-[210px_263px_minmax(418px,1fr)] md:grid-cols-2 md:grid-rows-[263px_minmax(320px,418px)]">
      <Card
        size="2"
        variant="classic"
        aria-labelledby="services-title"
        data-tour="dispatch-services"
        className="dispatch-services-card isolate h-[210px] overflow-x-hidden overflow-y-auto [--card-background-color:var(--color-panel-solid)] min-[1480px]:h-[210px] md:h-[263px]"
      >
        <Text id="services-title" size="2" weight="bold">
          ДДС / Службы
        </Text>

        {props.requiredServices.length > 0 && (
          <div className="mt-2 grid gap-1.5">
            <Text size="1" color="gray">
              Обязательные по классификатору
            </Text>
            {props.requiredServices.map((service) => (
              <div
                key={service.code}
                className="rounded-rx-2 border border-(--blue-a5) bg-(--blue-a2) px-2 py-1.5"
              >
                <Text as="div" size="1" weight="bold">
                  {service.name}
                </Text>
                <Text as="div" size="1" color="gray">
                  {service.routeLabel}
                </Text>
              </div>
            ))}
            <Separator className="my-1" size="4" />
          </div>
        )}

        <Text as="div" size="1" color="gray" mt="2">
          Дополнительный ручной выбор
        </Text>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {DISPATCH_SERVICES.map((service) => {
            const chosen = props.services.includes(service);

            return (
              <Button
                key={service}
                type="button"
                size="1"
                color={chosen ? "blue" : "gray"}
                variant={chosen ? "solid" : "soft"}
                // Службы выбираются только пока идёт разговор: закончившийся
                // звонок карточку уже не принимает.
                disabled={
                  props.state !== "active" ||
                  !props.isCardReady ||
                  props.isEnding
                }
                onClick={() => props.onToggleService(service)}
              >
                {DISPATCH_SERVICE_LABELS[service]}
              </Button>
            );
          })}
        </div>

        <Separator className="my-3" size="4" />
        <div className="grid gap-2">
          {props.services.length > 0 ? (
            props.services.map((service) => (
              <Unit key={service} name={DISPATCH_SERVICE_LABELS[service]} />
            ))
          ) : (
            <Text size="1" color="gray">
              Службы ещё не выбраны.
            </Text>
          )}
        </div>
      </Card>

      <Card
        size="1"
        variant="classic"
        data-tour="caller-chat"
        className="dispatch-chat-card h-[263px] min-w-0 overflow-hidden p-0!"
      >
        <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
          <div>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <Text size="2" weight="bold" className="block">
                  Чат с заявителем
                </Text>
                <Text size="1" color="gray" className="block truncate">
                  {props.state === "idle"
                    ? "Нет активного вызова"
                    : props.callerName}
                </Text>
              </div>
              <span
                className={`size-2 shrink-0 rounded-full ${props.state === "active" ? "bg-green-9" : "bg-gray-7"}`}
                aria-hidden
              />
            </div>
            <Separator size="4" />
          </div>
          <div className="min-h-0 px-4 py-3">
            <DialogueList
              props={props}
              empty="Сообщений с заявителем пока нет"
            />
          </div>
        </div>
      </Card>

      <Card
        size="1"
        variant="classic"
        data-tour="incident-map"
        className="dispatch-map-card relative min-h-[320px] overflow-hidden p-0! min-[1480px]:col-span-1 min-[1480px]:min-h-[418px] md:col-span-2"
      >
        <IncidentMap
          city={MOSCOW}
          incident={props.incident}
          controls={false}
          selectedPoint={props.selectedPoint}
          onSelectPoint={props.onSelectPoint}
          className="dispatch-map operator-map h-full min-h-[320px]"
        />
        <div className="absolute top-2 right-2 left-2 z-30 flex items-start justify-between gap-2">
          <PointHint
            selectable={Boolean(props.onSelectPoint)}
            hasPoint={Boolean(props.selectedPoint)}
            status={props.pointStatus}
          />
          <MapWindowButton label="Открыть в окне" />
        </div>
      </Card>
    </aside>
  );
}

/**
 * Что происходит с отмеченной точкой.
 *
 * Подсказка видна только пока идёт звонок: до приёма вызова и после его
 * завершения карта лишь показывает зону автоопределения.
 */
function PointHint({
  selectable,
  hasPoint,
  status,
}: {
  selectable: boolean;
  hasPoint: boolean;
  status: IncidentPointStatus;
}) {
  if (!selectable && status.state === "idle") return null;

  const content = (() => {
    switch (status.state) {
      case "resolving":
        return (
          <>
            <Spinner size="1" />
            <span>Определяем адрес точки…</span>
          </>
        );
      case "resolved":
        return (
          <>
            <MapPin size={14} className="shrink-0 text-(--red-9)" aria-hidden />
            <span className="truncate" title={status.label}>
              {status.label}
            </span>
          </>
        );
      case "failed":
        return (
          <>
            <AlertTriangle
              size={14}
              className="shrink-0 text-(--amber-11)"
              aria-hidden
            />
            <span className="truncate" title={status.message}>
              {status.message}. Координаты подставлены, адрес введите вручную.
            </span>
          </>
        );
      case "idle":
        return (
          <>
            <Crosshair
              size={14}
              className="shrink-0 text-(--gray-11)"
              aria-hidden
            />
            <span>
              {hasPoint
                ? "Кликните по карте, чтобы перенести точку"
                : "Кликните по карте, чтобы отметить место происшествия"}
            </span>
          </>
        );
    }
  })();

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none flex max-w-[min(360px,100%)] min-w-0 items-center gap-2 rounded-(--radius-3) bg-(--color-panel-solid) px-2.5 py-1.5 text-xs text-(--gray-12) shadow-md"
    >
      {content}
    </div>
  );
}

function DialogueList({
  props,
  empty,
}: {
  props: DispatchCallPanelProps;
  empty: string;
}) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const lastTurnId = props.dialogue.at(-1)?.id;

  useLayoutEffect(() => {
    if (!lastTurnId) return;

    const viewport = scrollAreaRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [lastTurnId]);

  if (props.dialogue.length === 0) {
    return (
      <Text size="1" color="gray">
        {empty}
      </Text>
    );
  }

  return (
    <ScrollArea
      type="auto"
      scrollbars="vertical"
      className="h-full min-w-0 pr-1"
      ref={scrollAreaRef}
    >
      <div className="grid w-full! min-w-0 gap-2 pr-3" aria-live="polite">
        {props.dialogue.map((turn) => (
          <div
            key={turn.id}
            className={
              turn.role === "operator"
                ? "bg-grayA-3 rounded-3 max-w-full min-w-0 overflow-hidden px-3 py-2"
                : "bg-blueA-3 rounded-3 max-w-full min-w-0 overflow-hidden px-3 py-2"
            }
          >
            <Text size="1" color="gray">
              {turn.role === "operator" ? "Оператор" : "Заявитель"}
            </Text>
            <Text
              size="2"
              as="p"
              className="max-w-full min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap"
            >
              {turn.text}
            </Text>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function Unit({ name }: { name: string }) {
  return (
    <Flex align="center" gap="2">
      <span className="bg-green-9 size-2 shrink-0 rounded-full" />
      <Text size="2" weight="medium" className="min-w-0 flex-1">
        {name}
      </Text>
      <Text size="1" color="gray">
        Выбрано оператором
      </Text>
    </Flex>
  );
}
