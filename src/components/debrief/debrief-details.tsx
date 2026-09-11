import { Badge, Button, Card, Flex, ScrollArea, Text } from "@bolid-ui/themes";
import { CircleAlert, CircleCheck, Play } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import type { Debrief } from "../../contracts/debrief";
import { DISPATCH_SERVICE_LABELS } from "../../contracts/incident";
import {
  conversationOf,
  describeTimelineEntry,
  formatDuration,
  formatOffset,
  PANIC_LABELS,
  type TranscriptLine,
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
  // Разбор начинается с того, что было сказано; факты и ступени паники
  // читаются следом, поэтому разговор открыт по умолчанию.
  const [view, setView] = useState<"conversation" | "events">("conversation");

  const play = async (url: string) => {
    const source = await loadRecordingSegment(url);
    setPlaying(source);
    void new Audio(source).play();
  };

  const segmentFor = (offsetMs: number | null) =>
    debrief.recording.find(
      (candidate) =>
        offsetMs !== null &&
        candidate.startMs <= offsetMs + 500 &&
        candidate.startMs + candidate.durationMs >= offsetMs,
    );

  const conversation = conversationOf(debrief.timeline);

  return (
    <Card size="2" variant="classic" className="lg:row-span-2">
      <Flex align="center" justify="between" gap="2">
        <Flex gap="1">
          <Button
            size="1"
            variant={view === "conversation" ? "soft" : "ghost"}
            onClick={() => setView("conversation")}
          >
            Разговор
          </Button>
          <Button
            size="1"
            variant={view === "events" ? "soft" : "ghost"}
            onClick={() => setView("events")}
          >
            Все события
          </Button>
        </Flex>
        {debrief.recording.length > 0 && (
          <Text size="1" color="gray">
            запись: {debrief.recording.length} фрагментов
          </Text>
        )}
      </Flex>

      {view === "conversation" && (
        <div className="mt-3 grid gap-3">
          {conversation.length === 0 && (
            <Text size="2" color="gray">
              Разговора не было: вызов завершился до первой реплики.
            </Text>
          )}
          {conversation.map((line) => (
            <TranscriptRow
              key={line.sequence}
              line={line}
              onPlay={() => {
                const segment = segmentFor(line.offsetMs);

                if (segment) {
                  void play(segment.url);
                }
              }}
              playable={segmentFor(line.offsetMs) !== undefined}
            />
          ))}
        </div>
      )}

      {view === "events" && (
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
      )}

      {playing && (
        <audio className="mt-3 w-full" controls src={playing}>
          <track kind="captions" />
        </audio>
      )}
    </Card>
  );
}

/** Одна реплика расшифровки: кто, когда, что сказал. */
function TranscriptRow({
  line,
  onPlay,
  playable,
}: {
  line: TranscriptLine;
  onPlay: () => void;
  playable: boolean;
}) {
  const caller = line.speaker === "caller";

  return (
    <Flex align="start" gap="2">
      <Text size="1" color="gray" className="w-12 shrink-0 tabular-nums">
        {formatOffset(line.offsetMs)}
      </Text>
      <div className="min-w-0 flex-1">
        <Flex align="center" gap="2">
          <Text size="1" weight="bold" color={caller ? "orange" : "blue"}>
            {caller ? "Заявитель" : "Оператор"}
          </Text>
          {line.note && (
            <Text size="1" color="gray">
              {line.note}
            </Text>
          )}
        </Flex>
        <Text size="2" as="p">
          {line.text}
        </Text>
      </div>
      {playable && (
        <Button
          size="1"
          variant="ghost"
          onClick={onPlay}
          aria-label="Прослушать"
        >
          <Play size={13} />
        </Button>
      )}
    </Flex>
  );
}
