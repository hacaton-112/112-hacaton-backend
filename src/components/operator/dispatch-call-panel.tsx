import {
  Badge,
  Button,
  Flex,
  IconButton,
  ScrollArea,
  Text,
} from "@bolid-ui/themes";
import {
  CircleUserRound,
  MessageSquare,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Play,
  RotateCcw,
} from "lucide-react";

import type {
  CallControls,
  CallSnapshot,
  CallState,
} from "../../hooks/use-call";

type DispatchCallPanelProps = CallSnapshot & CallControls;

const STATE_LABELS: Record<CallState, string> = {
  idle: "Оператор свободен",
  ringing: "Входящий вызов",
  active: "Разговор",
  ended: "Вызов завершён",
};

const formatDuration = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

const services = [
  "ДДС-01",
  "ДДС-02",
  "ДДС-03",
  "ДДС-04",
  "ЖКХ",
  "Полиция",
  "Скорая",
  "ЦУКС",
];

export function DispatchCallPanel(props: DispatchCallPanelProps) {
  return (
    <aside className="bg-background grid min-h-[560px] grid-rows-[42%_58%] md:col-span-2 lg:col-span-1 lg:h-full lg:min-h-0">
      <ScrollArea
        className="operator-column-scroll border-grayA-5 min-h-0 border-b"
        scrollbars="vertical"
        type="auto"
      >
        <section className="px-3 py-3">
          <Flex align="center" justify="between">
            <Flex align="center" gap="2">
              <Text size="2" weight="bold">
                Экстренные службы
              </Text>
              <Badge color="red" variant="solid" radius="full">
                2
              </Badge>
            </Flex>
            <Button type="button" size="1" variant="ghost">
              Изменить
            </Button>
          </Flex>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {services.map((service) => (
              <Button
                key={service}
                type="button"
                size="1"
                color="gray"
                variant="soft"
              >
                {service}
              </Button>
            ))}
          </div>

          <div className="mt-4 grid gap-2">
            <Unit name="ДДС-03" time="16:35" />
            <Unit name="ДДС-01" time="16:35" />
          </div>
        </section>
      </ScrollArea>

      <section className="relative flex min-h-0 flex-col overflow-hidden">
        <Flex
          align="center"
          gap="2"
          className="border-grayA-5 text-accent-11 h-11 shrink-0 border-b px-4"
        >
          <MessageSquare size={14} aria-hidden />
          <Text size="2" weight="medium">
            Чат с заявителем
          </Text>
        </Flex>

        <ScrollArea
          className="operator-column-scroll min-h-0 flex-1"
          scrollbars="vertical"
          type="auto"
        >
          <div className="px-5 py-4">
            <Flex align="center" justify="between">
              <Text size="2" weight="medium">
                2 участника
              </Text>
              <Badge
                color={props.state === "active" ? "green" : "gray"}
                variant="soft"
              >
                {STATE_LABELS[props.state]}
              </Badge>
            </Flex>

            <div className="mt-5 grid gap-3">
              <Participant color="green" name="operator2537" caption="Это вы" />
              <Participant
                color="blue"
                name="Иванов И.И."
                caption={props.state === "active" ? "Говорит" : "Заявитель"}
              />
            </div>

            {props.state === "ringing" && (
              <Flex gap="2" mt="5">
                <Button color="green" onClick={props.accept} className="flex-1">
                  <Phone size={15} /> Принять
                </Button>
                <Button
                  color="red"
                  variant="soft"
                  onClick={props.reject}
                  className="flex-1"
                >
                  <PhoneOff size={15} /> Отклонить
                </Button>
              </Flex>
            )}

            {props.state === "idle" && (
              <Button
                mt="5"
                variant="soft"
                onClick={props.simulateIncoming}
                className="w-full"
              >
                <PhoneIncoming size={15} /> Смоделировать входящий вызов
              </Button>
            )}

            {props.state === "ended" && (
              <Button
                mt="5"
                variant="soft"
                color="gray"
                onClick={props.reset}
                className="w-full"
              >
                <RotateCcw size={15} /> К следующему вызову
              </Button>
            )}
          </div>
        </ScrollArea>

        <Flex
          align="center"
          justify="center"
          gap="2"
          className="border-grayA-5 h-14 shrink-0 border-t"
        >
          <IconButton
            variant="soft"
            color="gray"
            aria-label="Добавить участника"
          >
            +
          </IconButton>
          <IconButton
            variant={props.isOnHold ? "solid" : "soft"}
            color="gray"
            onClick={props.toggleHold}
            disabled={props.state !== "active"}
            aria-label="Удержание"
          >
            {props.isOnHold ? <Play size={15} /> : <Pause size={15} />}
          </IconButton>
          <IconButton
            variant={props.isMuted ? "solid" : "soft"}
            color={props.isMuted ? "red" : "gray"}
            onClick={props.toggleMute}
            disabled={props.state !== "active"}
            aria-label="Микрофон"
          >
            {props.isMuted ? <MicOff size={15} /> : <Mic size={15} />}
          </IconButton>
          <Text size="2" className="w-14 text-center tabular-nums">
            {formatDuration(props.elapsedSeconds)}
          </Text>
          <IconButton
            color="red"
            onClick={props.end}
            disabled={props.state !== "active"}
            aria-label="Завершить вызов"
          >
            <PhoneOff size={15} />
          </IconButton>
        </Flex>
      </section>
    </aside>
  );
}

function Unit({ name, time }: { name: string; time: string }) {
  return (
    <Flex align="center" gap="2">
      <span className="bg-green-9 size-2.5 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <Text size="2" weight="medium">
          {name}
        </Text>
        <Text size="1" color="red">
          Создание
        </Text>
      </div>
      <Text size="1" color="gray">
        {time}
      </Text>
      <IconButton size="1" variant="soft" aria-label={`Позвонить ${name}`}>
        <Phone size={13} />
      </IconButton>
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
    <Flex align="center" gap="3">
      <div
        className={`grid size-9 place-items-center rounded-full text-white ${color === "green" ? "bg-green-9" : "bg-blue-9"}`}
      >
        <CircleUserRound size={20} />
      </div>
      <div>
        <Text size="2" weight="medium">
          {name}
        </Text>
        <Text size="1" color={caption === "Говорит" ? "green" : "gray"}>
          {caption}
        </Text>
      </div>
    </Flex>
  );
}
