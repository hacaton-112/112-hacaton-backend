import { Badge, Button, Card, Flex, ScrollArea, Text } from "@bolid-ui/themes";
import { CircleAlert, CircleCheck, Play } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import type { Debrief } from "../../contracts/debrief";
import { DISPATCH_SERVICE_LABELS } from "../../contracts/incident";
import {
  describeTimelineEntry,
  formatDuration,
  formatOffset,
  PANIC_LABELS,
} from "./debrief-formatters";
import { DebriefLine, DebriefNotice } from "./debrief-primitives";

interface DebriefDetailsProps {
  debrief?: Debrief;
  isPending: boolean;
  error: Error | null;
  loadRecordingSegment: (url: string) => Promise<string>;
}

export function DebriefDetails({
  debrief,
  isPending,
  error,
  loadRecordingSegment,
}: DebriefDetailsProps) {
  const navigate = useNavigate();

  if (error) {
    return (
      <DebriefNotice>Не удалось открыть разбор: {error.message}</DebriefNotice>
    );
  }

  if (isPending || !debrief) {
    return <DebriefNotice>Загружаю…</DebriefNotice>;
  }

  return (
    <ScrollArea className="h-full" scrollbars="vertical" type="auto">
      <div className="grid gap-3 p-4 lg:grid-cols-[1.4fr_1fr]">
        <Flex align="center" justify="between" className="lg:col-span-2">
          <Text size="3" weight="bold">
            {debrief.call.scenarioCode} · {debrief.call.title}
          </Text>
          <Button size="1" variant="soft" onClick={() => navigate("/debrief")}>
            К списку вызовов
          </Button>
        </Flex>

        <Timings debrief={debrief} />
        <Questions debrief={debrief} />
        <Timeline
          debrief={debrief}
          loadRecordingSegment={loadRecordingSegment}
        />
        <div className="grid content-start gap-3">
          <Facts debrief={debrief} />
          <FilledCard debrief={debrief} />
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
        <DebriefLine
          label="Ответ на вызов"
          value={`${answerSeconds ?? "—"} с при нормативе ${answerNormSeconds} с`}
          bad={late}
        />
        <DebriefLine label="Разговор" value={formatDuration(durationSeconds)} />
        <DebriefLine
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
          <DebriefLine label="Адрес" value={card.addressText ?? "—"} />
          <DebriefLine label="Тип" value={card.incidentType ?? "—"} />
          <DebriefLine
            label="Пострадавшие"
            value={`${card.victimsTotal ?? "—"}, из них детей ${card.victimsChildren ?? "—"}`}
          />
          <DebriefLine
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
          <DebriefLine label="Описание" value={card.description ?? "—"} />
        </div>
      )}
    </Card>
  );
}

function Timeline({
  debrief,
  loadRecordingSegment,
}: {
  debrief: Debrief;
  loadRecordingSegment: (url: string) => Promise<string>;
}) {
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
          const { title, text } = describeTimelineEntry(entry);
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
