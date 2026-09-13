import {
  Button,
  Card,
  Flex,
  ScrollArea,
  Separator,
  Text,
} from "@bolid-ui/themes";

import { IncidentMap } from "../map/incident-map";
import { MapWindowButton } from "../window/map-window-button";
import { MOSCOW } from "../../config/map";

import {
  DISPATCH_SERVICE_LABELS,
  DISPATCH_SERVICES,
  type DispatchService,
} from "../../contracts/incident";
import type { CallSnapshot } from "../../hooks/use-call";

interface ServicesProps {
  /** Выбранные службы карточки: тот же список, что уходит на backend. */
  services: DispatchService[];
  onToggleService: (service: DispatchService) => void;
}

type DispatchCallPanelProps = CallSnapshot &
  ServicesProps & {
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
        className="dispatch-services-card h-[210px] overflow-y-auto min-[1480px]:h-[210px] md:h-[263px]"
      >
        <Text id="services-title" size="2" weight="bold">
          ДДС / Службы
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
        className="dispatch-chat-card h-[263px] overflow-hidden p-0!"
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
        className="dispatch-map-card relative min-h-[320px] overflow-hidden p-0! min-[1480px]:col-span-1 min-[1480px]:min-h-[418px] md:col-span-2"
      >
        <IncidentMap
          city={MOSCOW}
          incident={props.incident}
          controls={false}
          className="dispatch-map operator-map h-full min-h-[320px]"
        />
        <div className="absolute top-2 right-2 left-2 z-30 flex justify-end">
          <MapWindowButton label="Открыть в окне" />
        </div>
      </Card>
    </aside>
  );
}

function DialogueList({
  props,
  empty,
}: {
  props: DispatchCallPanelProps;
  empty: string;
}) {
  if (props.dialogue.length === 0) {
    return (
      <Text size="1" color="gray">
        {empty}
      </Text>
    );
  }

  return (
    <ScrollArea type="auto" scrollbars="vertical" className="h-full pr-1">
      <div className="grid gap-2 pr-3">
        {props.dialogue.map((turn) => (
          <div
            key={turn.id}
            className={
              turn.role === "operator"
                ? "bg-grayA-3 rounded-3 px-3 py-2"
                : "bg-blueA-3 rounded-3 px-3 py-2"
            }
          >
            <Text size="1" color="gray">
              {turn.role === "operator" ? "Оператор" : "Заявитель"}
            </Text>
            <Text size="2" as="p">
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
