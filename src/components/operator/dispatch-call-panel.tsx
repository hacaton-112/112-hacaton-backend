import {
  Button,
  Card,
  Flex,
  IconButton,
  ScrollArea,
  Tabs,
  Text,
} from "@bolid-ui/themes";
import {
  CircleUserRound,
  MapPin,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneOff,
  Plus,
  ClipboardList,
  RotateCcw,
  Volume2,
} from "lucide-react";

import { IncidentMap } from "../map/incident-map";
import { MapWindowButton } from "../window/map-window-button";
import { MOSCOW } from "../../config/map";
import { useNavigate } from "react-router";

import {
  DISPATCH_SERVICE_LABELS,
  DISPATCH_SERVICES,
  type DispatchService,
} from "../../contracts/incident";
import type {
  CallControls,
  CallSnapshot,
  CallState,
} from "../../hooks/use-call";
import { ScenarioPicker } from "./scenario-picker";

interface ServicesProps {
  /** Выбранные службы карточки: тот же список, что уходит на backend. */
  services: DispatchService[];
  onToggleService: (service: DispatchService) => void;
}

type DispatchCallPanelProps = Omit<CallSnapshot & CallControls, "end"> &
  ServicesProps & {
    operatorName: string;
    callerName: string;
    isCardReady: boolean;
    isEnding: boolean;
    onEnd: () => void;
  };

const STATE_LABELS: Record<CallState, string> = {
  idle: "Оператор свободен",
  ringing: "Входящий вызов",
  active: "Разговор",
  ended: "Вызов завершён",
};

const formatDuration = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export function DispatchCallPanel(props: DispatchCallPanelProps) {
  const navigate = useNavigate();

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

        <div className="bg-grayA-4 my-3 h-px" />
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
        className="dispatch-call-card h-[263px] overflow-hidden p-0!"
      >
        <Tabs.Root
          defaultValue="call"
          className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]"
        >
          <Tabs.List size="1" justify="center" className="dispatch-tabs px-4">
            <Tabs.Trigger value="call">Звонок</Tabs.Trigger>
            <Tabs.Trigger value="record">Запись</Tabs.Trigger>
            <Tabs.Trigger value="applicant-chat">Чат с заявителем</Tabs.Trigger>
            <Tabs.Trigger value="service-chat" disabled>
              Служебный чат
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content
            value="call"
            className="min-h-0 overflow-y-auto px-4 pt-2"
          >
            <Flex align="start" justify="between" gap="2">
              <Text size="1" color="gray">
                {props.state === "idle" ? "Нет участников" : "2 участника"}
              </Text>
              <div className="text-right">
                <Text size="1" color="gray" as="div">
                  {STATE_LABELS[props.state]}
                </Text>
                <Text
                  size="2"
                  color={props.state === "active" ? "red" : "gray"}
                  weight="bold"
                  className="tabular-nums"
                >
                  {formatDuration(props.elapsedSeconds)}
                </Text>
              </div>
            </Flex>

            {props.state !== "idle" && (
              <div className="mt-2 grid gap-2">
                <Participant
                  color="green"
                  name={props.operatorName}
                  caption={props.isListening ? "Говорит" : "Это вы"}
                />
                <Participant
                  color="blue"
                  name={props.callerName}
                  caption={props.isCallerSpeaking ? "Говорит" : "Заявитель"}
                />
              </div>
            )}

            {props.state === "ringing" && (
              <Flex gap="2" mt="3">
                <Button
                  size="1"
                  color="green"
                  onClick={props.accept}
                  className="flex-1"
                >
                  <Phone size={14} /> Принять
                </Button>
                <Button
                  size="1"
                  color="red"
                  variant="soft"
                  onClick={props.reject}
                  className="flex-1"
                >
                  <PhoneOff size={14} /> Отклонить
                </Button>
              </Flex>
            )}

            {props.state === "idle" && (
              <ScenarioPicker
                disabled={!props.isConnected}
                onStart={props.startScenario}
              />
            )}

            {props.state === "active" && (
              <Button
                mt="3"
                size="1"
                variant={props.isListening ? "solid" : "soft"}
                color={props.isListening ? "red" : undefined}
                disabled={props.isMuted}
                onPointerDown={props.holdFloor}
                onPointerUp={props.releaseFloor}
                onPointerLeave={props.releaseFloor}
                onPointerCancel={props.releaseFloor}
                className="w-full"
              >
                <Mic size={14} />
                {props.isListening
                  ? "Отпустите, чтобы ответил заявитель"
                  : "Нажмите и говорите"}
              </Button>
            )}

            {props.state === "ended" && (
              <Flex gap="2" mt="3">
                {props.trainingSessionId && (
                  <Button
                    size="1"
                    variant="soft"
                    onClick={() =>
                      navigate(`/debrief/${props.trainingSessionId}`)
                    }
                    className="flex-1"
                  >
                    <ClipboardList size={14} /> Разбор вызова
                  </Button>
                )}
                <Button
                  size="1"
                  variant="soft"
                  color="gray"
                  onClick={props.reset}
                  className="flex-1"
                >
                  <RotateCcw size={14} /> К следующему вызову
                </Button>
              </Flex>
            )}
          </Tabs.Content>

          <Tabs.Content
            value="record"
            className="min-h-0 overflow-y-auto px-4 py-4"
          >
            <Text size="1" color="gray">
              {props.state === "ended"
                ? "Запись разговора доступна в разборе завершённого вызова."
                : props.state === "idle"
                  ? "Нет активного вызова."
                  : "Запись ведётся и будет доступна после завершения вызова."}
            </Text>
          </Tabs.Content>

          <Tabs.Content
            value="applicant-chat"
            className="min-h-0 overflow-y-auto px-4 py-3"
          >
            <DialogueList
              props={props}
              empty="Сообщений с заявителем пока нет"
            />
          </Tabs.Content>

          <Tabs.Content
            value="service-chat"
            className="min-h-0 overflow-y-auto px-4 py-4"
          >
            <Text size="1" color="gray">
              Служебных сообщений пока нет.
            </Text>
          </Tabs.Content>

          <Flex
            align="center"
            justify="between"
            gap="2"
            className="border-grayA-4 shrink-0 border-t px-4 py-2"
          >
            <ControlButton
              label="Добавление участника недоступно в учебном звонке"
              disabled
            >
              <Plus size={15} />
            </ControlButton>
            <IconButton
              size="2"
              radius="full"
              variant={props.isMuted ? "solid" : "soft"}
              color={props.isMuted ? "red" : "gray"}
              onClick={props.toggleMute}
              disabled={props.state !== "active"}
              aria-label="Микрофон"
            >
              {props.isMuted ? <MicOff size={15} /> : <Mic size={15} />}
            </IconButton>
            <IconButton
              size="2"
              radius="full"
              variant="soft"
              color="gray"
              disabled
              title="Удержание недоступно в учебном звонке"
              aria-label="Удержание недоступно в учебном звонке"
            >
              <Pause size={15} />
            </IconButton>
            <ControlButton
              label="Управление динамиком недоступно в учебном звонке"
              disabled
            >
              <Volume2 size={15} />
            </ControlButton>
            <IconButton
              size="2"
              radius="full"
              color="red"
              onClick={props.onEnd}
              disabled={
                props.state !== "active" || !props.isCardReady || props.isEnding
              }
              aria-label="Завершить вызов"
            >
              <PhoneOff size={15} />
            </IconButton>
          </Flex>
        </Tabs.Root>
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
        {props.incident && (
          <MapPin
            size={26}
            className="text-red-9 pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-full fill-white"
            aria-hidden
          />
        )}
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
    <ScrollArea type="auto" scrollbars="vertical" className="max-h-44">
      <div className="grid gap-2 pr-2">
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

function Participant({
  color,
  name,
  caption,
}: {
  color: "green" | "blue";
  name: string;
  caption: string;
}) {
  return (
    <Flex align="center" gap="2">
      <div
        className={`grid size-8 place-items-center rounded-full text-white ${color === "green" ? "bg-green-9" : "bg-blue-9"}`}
      >
        <CircleUserRound size={18} />
      </div>
      <div className="min-w-0">
        <Text size="2" weight="medium" className="block truncate">
          {name}
        </Text>
        <Text size="1" color={caption === "Говорит" ? "green" : "gray"}>
          {caption}
        </Text>
      </div>
    </Flex>
  );
}

function ControlButton({
  children,
  label,
  disabled = false,
}: {
  children: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <IconButton
      size="2"
      radius="full"
      variant="soft"
      color="gray"
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      {children}
    </IconButton>
  );
}
