import { Badge, Button, Card, Flex, ScrollArea, Text } from "@bolid-ui/themes";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Play } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import type {
  CallSummary,
  Debrief,
  TimelineEntry,
} from "../../contracts/debrief";
import { DISPATCH_SERVICE_LABELS } from "../../contracts/incident";
import {
  listCalls,
  loadDebrief,
  loadRecordingSegment,
} from "../../services/debrief.service";

const PANIC_LABELS = ["спокоен", "встревожен", "испуган", "паника", "истерика"];

const formatDuration = (seconds: number | null) =>
  seconds === null
    ? "—"
    : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

const formatOffset = (offsetMs: number | null) =>
  offsetMs === null ? "" : formatDuration(Math.floor(offsetMs / 1_000));

/** Как показать событие журнала: что писать в строке ленты. */
const describe = (entry: TimelineEntry): { title: string; text?: string } => {
  const details = entry.details as Record<string, string | number | undefined>;

  switch (entry.type) {
    case "operator.utterance":
      return { title: "Оператор", text: String(details.text ?? "") };
    case "caller.reply":
      return { title: "Заявитель", text: String(details.text ?? "") };
    case "caller.initiative":
      return { title: "Заявитель заговорил сам" };
    case "fact.revealed":
      return { title: "Получено сведение", text: String(details.label ?? "") };
    case "panic.changed":
      return {
        title: "Состояние заявителя",
        text: `${PANIC_LABELS[Number(details.from)] ?? details.from} → ${
          PANIC_LABELS[Number(details.to)] ?? details.to
        } (${details.trigger ?? ""})`,
      };
    case "escalation.fired":
      // Правило сработало, но ступень не сдвинулась: чаще всего это
      // запрещённая фраза оператора на верхней ступени шкалы.
      return {
        title: "Сработало правило",
        text: String(details.trigger ?? ""),
      };
    case "call.offered":
      return { title: "Входящий вызов" };
    case "call.accepted":
      return { title: "Вызов принят" };
    case "call.declined":
      return { title: "Вызов отклонён" };
    case "call.ended":
      return { title: "Вызов завершён", text: String(details.reason ?? "") };
    case "stage.changed":
      return { title: `Этап: ${String(details.to ?? "")}` };
    default:
      return { title: entry.type };
  }
};

export default function DebriefPage() {
  const { trainingSessionId } = useParams();

  return trainingSessionId ? (
    <OneCall trainingSessionId={trainingSessionId} />
  ) : (
    <CallList />
  );
}

function CallList() {
  const navigate = useNavigate();
  const { data, isPending, error } = useQuery({
    queryKey: ["calls"],
    queryFn: listCalls,
  });

  if (error) {
    return <Notice>Не удалось получить список вызовов: {error.message}</Notice>;
  }

  if (isPending) {
    return <Notice>Загружаю…</Notice>;
  }

  if (data.length === 0) {
    return <Notice>Проведённых вызовов пока нет.</Notice>;
  }

  return (
    <ScrollArea className="h-full" scrollbars="vertical" type="auto">
      <div className="grid gap-2 p-4">
        {data.map((call) => (
          <CallRow
            key={call.trainingSessionId}
            call={call}
            onOpen={() => navigate(`/debrief/${call.trainingSessionId}`)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

function CallRow({ call, onOpen }: { call: CallSummary; onOpen: () => void }) {
  return (
    <Card size="2" variant="classic">
      <Flex align="center" justify="between" gap="3">
        <div className="min-w-0">
          <Text size="2" weight="medium">
            {call.scenarioCode} · {call.title}
          </Text>
          <Text size="1" color="gray" as="p">
            {new Date(call.offeredAt).toLocaleString("ru-RU")} · разговор{" "}
            {formatDuration(call.durationSeconds)}
          </Text>
        </div>
        <Flex align="center" gap="2">
          <Badge
            color={call.stage === "ended" ? "gray" : "amber"}
            variant="soft"
          >
            {call.stage === "declined" ? "отклонён" : "завершён"}
          </Badge>
          <Button size="1" variant="soft" onClick={onOpen}>
            Разбор
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}

function OneCall({ trainingSessionId }: { trainingSessionId: string }) {
  const navigate = useNavigate();
  const { data, isPending, error } = useQuery({
    queryKey: ["debrief", trainingSessionId],
    queryFn: () => loadDebrief(trainingSessionId),
  });

  if (error) {
    return <Notice>Не удалось открыть разбор: {error.message}</Notice>;
  }

  if (isPending) {
    return <Notice>Загружаю…</Notice>;
  }

  return (
    <ScrollArea className="h-full" scrollbars="vertical" type="auto">
      <div className="grid gap-3 p-4 lg:grid-cols-[1.4fr_1fr]">
        <Flex align="center" justify="between" className="lg:col-span-2">
          <Text size="3" weight="bold">
            {data.call.scenarioCode} · {data.call.title}
          </Text>
          <Button size="1" variant="soft" onClick={() => navigate("/debrief")}>
            К списку вызовов
          </Button>
        </Flex>

        <Timings debrief={data} />
        <Questions debrief={data} />
        <Timeline debrief={data} />
        <div className="grid content-start gap-3">
          <Facts debrief={data} />
          <FilledCard debrief={data} />
        </div>
      </div>
    </ScrollArea>
  );
}

function Timings({ debrief }: { debrief: Debrief }) {
  const { answerSeconds, answerNormSeconds, durationSeconds } = debrief.timings;
  const late = answerSeconds !== null && answerSeconds > answerNormSeconds;

  return (
    <Card size="2" variant="classic">
      <Text size="2" weight="bold">
        Как прошёл вызов
      </Text>
      <div className="mt-3 grid gap-2">
        <Line
          label="Ответ на вызов"
          value={`${answerSeconds ?? "—"} с при нормативе ${answerNormSeconds} с`}
          bad={late}
        />
        <Line label="Разговор" value={formatDuration(durationSeconds)} />
        <Line
          label="Состояние заявителя в конце"
          value={PANIC_LABELS[debrief.finalPanicLevel] ?? "—"}
          bad={debrief.finalPanicLevel >= 3}
        />
      </div>
    </Card>
  );
}

function Questions({ debrief }: { debrief: Debrief }) {
  const closed = debrief.questions.filter((question) => question.satisfied);

  return (
    <Card size="2" variant="classic">
      <Text size="2" weight="bold">
        Обязательные вопросы · {closed.length} из {debrief.questions.length}
      </Text>
      <div className="mt-3 grid gap-2">
        {debrief.questions.map((question) => (
          <Flex key={question.text} align="start" gap="2">
            {question.satisfied ? (
              <CircleCheck size={15} className="text-green-9 mt-0.5 shrink-0" />
            ) : (
              <CircleAlert
                size={15}
                className={`mt-0.5 shrink-0 ${question.isCritical ? "text-red-9" : "text-amber-9"}`}
              />
            )}
            <Text size="2">
              {question.text}
              {question.isCritical && !question.satisfied ? " · критично" : ""}
            </Text>
          </Flex>
        ))}
      </div>
    </Card>
  );
}

function Facts({ debrief }: { debrief: Debrief }) {
  const got = debrief.facts.filter((fact) => fact.revealed);

  return (
    <Card size="2" variant="classic">
      <Text size="2" weight="bold">
        Сведения · {got.length} из {debrief.facts.length}
      </Text>
      <div className="mt-3 grid gap-1.5">
        {debrief.facts.map((fact) => (
          <Flex key={fact.key} align="center" gap="2">
            <span
              className={`size-2 shrink-0 rounded-full ${fact.revealed ? "bg-green-9" : "bg-grayA-6"}`}
            />
            <Text size="2" color={fact.revealed ? undefined : "gray"}>
              {fact.label}
            </Text>
            {fact.severity === "heavy" && (
              <Badge color="red" variant="soft" size="1">
                тяжёлое
              </Badge>
            )}
          </Flex>
        ))}
      </div>
    </Card>
  );
}

function FilledCard({ debrief }: { debrief: Debrief }) {
  const card = debrief.incidentCard;

  return (
    <Card size="2" variant="classic">
      <Text size="2" weight="bold">
        Карточка происшествия
      </Text>
      {card === null ? (
        <Text size="2" color="gray" as="p" mt="2">
          Оператор ничего не записал.
        </Text>
      ) : (
        <div className="mt-3 grid gap-2">
          <Line label="Адрес" value={card.addressText ?? "—"} />
          <Line label="Тип" value={card.incidentType ?? "—"} />
          <Line
            label="Пострадавшие"
            value={`${card.victimsTotal ?? "—"}, из них детей ${card.victimsChildren ?? "—"}`}
          />
          <Line
            label="Службы"
            value={
              card.services.length === 0
                ? "не выбраны"
                : card.services
                    .map((service) => DISPATCH_SERVICE_LABELS[service])
                    .join(", ")
            }
            bad={card.services.length === 0}
          />
          <Line label="Описание" value={card.description ?? "—"} />
        </div>
      )}
    </Card>
  );
}

function Timeline({ debrief }: { debrief: Debrief }) {
  const [playing, setPlaying] = useState<string>();

  const play = async (url: string) => {
    const source = await loadRecordingSegment(url);
    setPlaying(source);
    void new Audio(source).play();
  };

  return (
    <Card size="2" variant="classic" className="lg:row-span-2">
      <Flex align="center" justify="between">
        <Text size="2" weight="bold">
          Ход разговора
        </Text>
        {debrief.recording.length > 0 && (
          <Text size="1" color="gray">
            запись: {debrief.recording.length} фрагментов
          </Text>
        )}
      </Flex>

      <div className="mt-3 grid gap-2">
        {debrief.timeline.map((entry) => {
          const { title, text } = describe(entry);
          // Кусок записи, начавшийся ближе всего к событию: его и слушаем.
          const segment = debrief.recording.find(
            (candidate) =>
              entry.offsetMs !== null &&
              candidate.startMs <= entry.offsetMs + 500 &&
              candidate.startMs + candidate.durationMs >= entry.offsetMs,
          );

          return (
            <Flex key={entry.sequence} align="start" gap="2">
              <Text
                size="1"
                color="gray"
                className="w-12 shrink-0 tabular-nums"
              >
                {formatOffset(entry.offsetMs)}
              </Text>
              <div className="min-w-0 flex-1">
                <Text size="1" color="gray">
                  {title}
                </Text>
                {text && (
                  <Text size="2" as="p">
                    {text}
                  </Text>
                )}
              </div>
              {segment && (
                <Button
                  size="1"
                  variant="ghost"
                  onClick={() => void play(segment.url)}
                  aria-label="Прослушать"
                >
                  <Play size={13} />
                </Button>
              )}
            </Flex>
          );
        })}
      </div>
      {playing && (
        <audio className="mt-3 w-full" controls src={playing}>
          <track kind="captions" />
        </audio>
      )}
    </Card>
  );
}

function Line({
  label,
  value,
  bad = false,
}: {
  label: string;
  value: string;
  bad?: boolean;
}) {
  return (
    <Flex align="start" justify="between" gap="3">
      <Text size="2" color="gray" className="shrink-0">
        {label}
      </Text>
      <Text size="2" color={bad ? "red" : undefined} className="text-right">
        {value}
      </Text>
    </Flex>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <Flex align="center" justify="center" className="h-full p-6">
      <Text size="2" color="gray">
        {children}
      </Text>
    </Flex>
  );
}
