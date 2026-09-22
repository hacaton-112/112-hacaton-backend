import { Badge, Button, Card, Flex, Heading, Text } from "@bolid-ui/themes";
import { ClipboardCheck, Trophy } from "lucide-react";
import { useState } from "react";

import type {
  DdsExercise,
  DdsResponseStatus,
} from "../../contracts/dds-exercise";
import { ddsReferenceService } from "../../services/dds-reference.service";
import { DdsAcknowledgementTimer } from "./dds-acknowledgement-timer";
import { DdsCardArmHeader } from "./dds-card-arm-header";
import { DdsCrewHandoffBlock } from "./dds-crew-handoff";
import {
  ddsTextEvaluationMode,
  DDS_STATUS_LABELS,
  DDS_VIOLATION_LABELS,
} from "./dds-formatters";
import { DdsStatusActions } from "./dds-status-actions";

type TransitionStatus = Exclude<
  DdsResponseStatus,
  "pending" | "lesson_finished"
>;

export function DdsCardPanel({
  exercise,
  pending,
  error,
  onTransition,
  readOnly = false,
}: {
  exercise?: DdsExercise;
  pending: boolean;
  error?: string;
  onTransition: (status: TransitionStatus, comment?: string) => Promise<void>;
  readOnly?: boolean;
}) {
  // Журнал раскрыт сразу, а смена статуса ждёт карандаша на плитке: в АРМ
  // диспетчер сначала видит историю службы и только потом правит статус.
  const [journalOpen, setJournalOpen] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);

  if (!exercise) {
    return (
      <Card
        size="3"
        variant="classic"
        className="arm-dds-card-empty grid place-content-center gap-2 text-center"
      >
        <ClipboardCheck className="text-gray-8 mx-auto" size={34} />
        <Heading size="4">Выберите входящую карточку</Heading>
        <Text size="2" color="gray">
          Откройте назначение преподавателя или дождитесь отправки карточки
          оператором 112.
        </Text>
      </Card>
    );
  }

  return (
    <div className="arm-dds-card-panel grid content-start gap-2">
      <DdsCardArmHeader
        exercise={exercise}
        journalOpen={journalOpen}
        onToggleJournal={() => setJournalOpen((open) => !open)}
        canEdit={!readOnly}
        onEdit={() => setEditorOpen(true)}
      />

      <Card size="3" variant="classic" className="arm-dds-card grid gap-3">
        <Flex align="center" justify="between" gap="3" wrap="wrap">
          <Text size="2" weight="bold">
            Статус службы: {DDS_STATUS_LABELS[exercise.status]}
          </Text>
          <DdsAcknowledgementTimer key={exercise.id} exercise={exercise} />
        </Flex>

        {exercise.crewHandoff && (
          <DdsCrewHandoffBlock
            exerciseId={exercise.id}
            handoff={exercise.crewHandoff}
            canCall={exercise.status === "accepted"}
            readOnly={readOnly}
          />
        )}

        {!readOnly && editorOpen && (
          <DdsStatusActions
            key={`${exercise.id}:${exercise.status}`}
            exercise={exercise}
            pending={pending}
            error={error}
            onTransition={onTransition}
          />
        )}
      </Card>

      {exercise.result && (
        <Card size="3" variant="classic" className="arm-dds-result">
          <Flex align="center" gap="3" wrap="wrap">
            <Trophy
              size={28}
              className={exercise.result.passed ? "text-green-9" : "text-red-9"}
            />
            <div className="min-w-0 flex-1">
              <Heading size="4">
                {exercise.result.passed
                  ? "Упражнение выполнено"
                  : "Упражнение не зачтено"}
              </Heading>
              <Text as="p" size="2" color="gray">
                Первичный статус:{" "}
                {exercise.result.acknowledgementMet
                  ? "в нормативе"
                  : "позже установленного срока"}
                . Итог: {DDS_STATUS_LABELS[exercise.result.terminalStatus]}.
              </Text>
              <Text as="p" size="1" color="gray" mt="1">
                {exercise.result.violations.length === 0
                  ? "Нарушений не зафиксировано."
                  : exercise.result.violations
                      .map((violation) => DDS_VIOLATION_LABELS[violation])
                      .join(" · ")}
              </Text>
            </div>
            <Badge
              size="3"
              color={exercise.result.passed ? "green" : "red"}
              variant="soft"
            >
              {exercise.result.score} баллов
            </Badge>
          </Flex>
        </Card>
      )}

      {exercise.result && (
        <DdsTextResult
          exerciseId={exercise.id}
          evaluation={exercise.textEvaluation}
          instructorView={readOnly}
        />
      )}

      {/* Журнал статусов службы: в реальном АРМ он раскрывается с плитки. */}
      {journalOpen && (
        <div className="arm-card-journal-panel">
          <div className="arm-card-journal-head">
            <strong>{DDS_STATUS_LABELS[exercise.status]}</strong>
            <span>Событий: {exercise.events.length}</span>
          </div>
          {exercise.events.map((event) => (
            <div key={event.sequence} className="arm-card-journal-row">
              <span className="arm-card-journal-actor">оп. 0</span>
              <span className="arm-card-journal-time">
                {new Date(event.occurredAt).toLocaleString("ru-RU")}
              </span>
              <span className="arm-card-journal-status">
                {DDS_STATUS_LABELS[event.toStatus]}
              </span>
              {event.comment && (
                <span className="arm-card-journal-comment">
                  {event.comment}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DdsTextResult({
  exerciseId,
  evaluation,
  instructorView,
}: {
  exerciseId: string;
  evaluation: DdsExercise["textEvaluation"];
  instructorView: boolean;
}) {
  const [retrying, setRetrying] = useState(false);
  const mode = ddsTextEvaluationMode(evaluation);
  if (mode === "preliminary") {
    return (
      <Card size="2" variant="surface">
        <Badge color="amber">Предварительный результат</Badge>
        <Text as="p" size="2" color="gray" mt="2">
          Текст диспетчера и грамотность ещё оцениваются. Текущий балл рассчитан
          без текстовой части.
        </Text>
      </Card>
    );
  }
  // `mode` вычисляется отдельной чистой функцией, поэтому TypeScript не может
  // вывести из предыдущей ветки, что значение здесь уже существует.
  if (!evaluation) return null;
  if (mode === "unavailable") {
    return (
      <Card size="2" variant="surface">
        <Badge color="gray">Без оценки текста</Badge>
        <Text as="p" size="2" color="gray" mt="2">
          {evaluation.error ?? "Подтверждённый эталон недоступен."}
        </Text>
        {instructorView && (
          <Button
            mt="2"
            size="1"
            variant="soft"
            disabled={retrying}
            onClick={() => {
              setRetrying(true);
              void ddsReferenceService
                .retry(exerciseId)
                .finally(() => setRetrying(false));
            }}
          >
            Пересчитать
          </Button>
        )}
      </Card>
    );
  }
  const grammar = evaluation.grammar as {
    errorCount?: number;
    styleCount?: number;
  } | null;
  return (
    <Card size="2" variant="surface" className="grid gap-2">
      <Heading size="3">Оценка текста</Heading>
      {evaluation.coverage.map((item) => (
        <div key={item.id}>
          <Flex align="center" justify="between" gap="3">
            <Text size="2">{item.label}</Text>
            <Badge color={item.status === "present" ? "green" : "red"}>
              {item.status === "present" ? "Названо" : "Не названо"}
            </Badge>
          </Flex>
          {instructorView && item.quote && (
            <Text as="p" size="1" color="gray">
              «{item.quote}»
            </Text>
          )}
        </div>
      ))}
      {evaluation.contradictions.map((item, index) => (
        <Text key={`${item.quote}-${index}`} size="2" color="red">
          Противоречие: {item.description}
          {instructorView ? ` — «${item.quote}»` : ""}
        </Text>
      ))}
      <Text size="2" color="gray">
        Грамматика: ошибок {grammar?.errorCount ?? 0}, замечаний по стилю{" "}
        {grammar?.styleCount ?? 0}.
      </Text>
    </Card>
  );
}
