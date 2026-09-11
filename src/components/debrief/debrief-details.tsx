import { Badge, Button, Card, Flex, ScrollArea, Text } from "@bolid-ui/themes";
import { useNavigate } from "react-router";

import type { Debrief } from "../../contracts/debrief";
import { DISPATCH_SERVICE_LABELS } from "../../contracts/incident";
import { formatDuration, PANIC_LABELS } from "./debrief-formatters";
import { DebriefLine, DebriefNotice } from "./debrief-primitives";
import {
  QuestionsCard,
  RecommendationsCard,
  ReferenceCard,
} from "./debrief-questions";
import { AnswerStatsCard, ScoreCard, TimeCard } from "./debrief-score";
import { GroupCard, SkillsCard } from "./debrief-skills";
import { Transcript } from "./debrief-transcript";

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

  const evaluation = debrief.evaluation;

  return (
    <ScrollArea className="h-full" scrollbars="vertical" type="auto">
      <div className="grid gap-4 p-5">
        <Flex align="center" justify="between" gap="3" wrap="wrap">
          <Flex align="center" gap="3">
            <Text size="6" weight="bold">
              {debrief.call.title}
            </Text>
            {evaluation && (
              <Badge color="orange" variant="soft" radius="full">
                Сложность {evaluation.difficulty}/5
              </Badge>
            )}
            <Badge color="gray" variant="soft" radius="full">
              {debrief.call.scenarioCode}
            </Badge>
          </Flex>
          <Flex gap="2">
            <Button variant="soft" onClick={() => navigate("/")}>
              Пройти заново
            </Button>
            <Button onClick={() => navigate("/debrief")}>
              К списку вызовов
            </Button>
          </Flex>
        </Flex>

        <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_320px]">
          <div className="grid content-start gap-4">
            {evaluation && <ScoreCard evaluation={evaluation} />}
            <TimeCard debrief={debrief} />
            <AnswerStatsCard debrief={debrief} />
            <CallState debrief={debrief} />
          </div>

          <div className="grid content-start gap-4">
            <QuestionsCard debrief={debrief} />
            {evaluation && <RecommendationsCard evaluation={evaluation} />}
            <Transcript
              debrief={debrief}
              loadRecordingSegment={loadRecordingSegment}
            />
          </div>

          <div className="grid content-start gap-4 lg:col-start-2 xl:col-start-auto">
            {evaluation && <SkillsCard evaluation={evaluation} />}
            {evaluation && <GroupCard evaluation={evaluation} />}
            {evaluation && <ReferenceCard evaluation={evaluation} />}
            <FilledCard debrief={debrief} />
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

/** Чем закончился звонок для заявителя, а не для оценки. */
function CallState({ debrief }: { debrief: Debrief }) {
  const closed = debrief.questions.filter((question) => question.satisfied);

  return (
    <Card size="3" variant="classic">
      <Text size="2" weight="bold">
        Как прошёл вызов
      </Text>
      <div className="mt-3 grid gap-2">
        <DebriefLine
          label="Разговор"
          value={formatDuration(debrief.timings.durationSeconds)}
        />
        <DebriefLine
          label="Обязательные вопросы"
          value={`${closed.length} из ${debrief.questions.length}`}
          bad={closed.length < debrief.questions.length}
        />
        <DebriefLine
          label="Состояние заявителя в конце"
          value={PANIC_LABELS[debrief.finalPanicLevel] ?? "—"}
          bad={debrief.finalPanicLevel >= 3}
        />
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
