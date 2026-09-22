import {
  Badge,
  Button,
  Callout,
  Card,
  DataList,
  Heading,
  ScrollArea,
  Skeleton,
  Text,
} from "@bolid-ui/themes";
import { AlertTriangle, ArrowRight, Play } from "lucide-react";
import { useNavigate } from "react-router";
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ddsTrainingService } from "../../services/dds-training.service";

import { ROUTES } from "../../config/routes";
import {
  attemptsLeft,
  type ActiveTrainingAttempt,
  type TrainingAssignment,
} from "../../contracts/training";
import { useMyAssignments } from "../../hooks/use-training";
import { writeActiveTrainingSession } from "../../lib/active-call-session";
import { useAuthStore } from "../../stores/auth.store";
import {
  CARD_SOURCE_LABELS,
  formatDateTime,
  formatDuration,
} from "./training-labels";

/** Лента оператора: только занятия, запущенные его преподавателем. */
export function OperatorAssignmentList() {
  const overview = useMyAssignments();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const operatorId = useAuthStore((state) => state.user?.id);
  const assignments = overview.data?.assignments;
  const activeAttempt = overview.data?.activeAttempt ?? null;
  const startEvents = useRef(new Map<string, string>());
  const startDds = useMutation({
    mutationFn: (assignmentId: string) => {
      let eventId = startEvents.current.get(assignmentId);
      if (!eventId) {
        eventId = crypto.randomUUID();
        startEvents.current.set(assignmentId, eventId);
      }
      return ddsTrainingService.start(assignmentId, eventId);
    },
    retry: false,
    scope: { id: "start-dds-attempt" },
    onSuccess: (exercise, assignmentId) => {
      startEvents.current.delete(assignmentId);
      void queryClient.invalidateQueries({ queryKey: ["dds-exercises"] });
      void overview.refetch();
      navigate(ROUTES.ddsExercise(exercise.id));
    },
    onError: () => void overview.refetch(),
  });

  const continueAttempt = (attempt: ActiveTrainingAttempt) => {
    if (attempt.type === "card_action" && attempt.exerciseId) {
      navigate(ROUTES.ddsExercise(attempt.exerciseId));
      return;
    }

    writeActiveTrainingSession(operatorId, attempt.trainingSessionId);
    navigate(
      ROUTES.operatorWithAssignment(
        attempt.scenarioVersionId,
        attempt.assignmentId,
      ),
    );
  };

  return (
    <ScrollArea className="h-full" type="auto" scrollbars="vertical">
      <main className="grid w-full gap-4 p-4 md:p-6">
        <header>
          <Heading size="6">Мои назначения</Heading>
          <Text as="p" color="gray" size="2">
            Здесь появляются занятия, которые запустил ваш преподаватель.
          </Text>
        </header>

        {overview.error && !overview.data && (
          <Callout.Root color="red" role="alert">
            <Callout.Icon>
              <AlertTriangle size={16} />
            </Callout.Icon>
            <Callout.Text>
              Не удалось получить назначения: {overview.error.message}
            </Callout.Text>
          </Callout.Root>
        )}

        {activeAttempt && (
          <Callout.Root color="amber" role="status">
            <Callout.Icon>
              <Play size={16} />
            </Callout.Icon>
            <Callout.Text>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Text as="p" weight="bold">
                    Уже выполняется попытка №{activeAttempt.attemptNumber}
                  </Text>
                  <Text as="p" size="2">
                    {activeAttempt.assignmentTitle} ·{" "}
                    {activeAttempt.type === "card_action"
                      ? "ДДС — карточка"
                      : "Звонок"}
                    . Начата {formatDateTime(activeAttempt.startedAt)}.
                  </Text>
                </div>
                <Button
                  type="button"
                  color="amber"
                  variant="soft"
                  onClick={() => continueAttempt(activeAttempt)}
                >
                  Продолжить попытку <ArrowRight size={16} />
                </Button>
              </div>
            </Callout.Text>
          </Callout.Root>
        )}

        {assignments?.length === 0 && (
          <Card size="3">
            <Text color="gray">Активных назначений пока нет.</Text>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {overview.isPending
            ? [0, 1, 2, 3].map((index) => (
                <Skeleton
                  key={index}
                  height="260px"
                  className="rounded-(--radius-4)"
                />
              ))
            : assignments?.map((assignment) => (
                <OperatorAssignmentCard
                  key={assignment.id}
                  assignment={assignment}
                  busy={
                    startDds.isPending && startDds.variables === assignment.id
                  }
                  activeAttempt={activeAttempt}
                  onContinue={() =>
                    activeAttempt && continueAttempt(activeAttempt)
                  }
                  onStart={() =>
                    assignment.type === "card_action"
                      ? startDds.mutate(assignment.id)
                      : navigate(
                          ROUTES.operatorWithAssignment(
                            assignment.scenarioVersionId,
                            assignment.id,
                          ),
                        )
                  }
                />
              ))}
        </div>
        {startDds.error && (
          <Callout.Root color="red" role="alert">
            <Callout.Text>{startDds.error.message}</Callout.Text>
          </Callout.Root>
        )}
      </main>
    </ScrollArea>
  );
}

function OperatorAssignmentCard({
  assignment,
  onStart,
  onContinue,
  busy,
  activeAttempt,
}: {
  assignment: TrainingAssignment;
  onStart: () => void;
  onContinue: () => void;
  busy: boolean;
  activeAttempt: ActiveTrainingAttempt | null;
}) {
  const left = attemptsLeft(assignment);
  const exhausted = left === 0;
  const isCurrentAttempt = activeAttempt?.assignmentId === assignment.id;
  const blockedByAnother = activeAttempt !== null && !isCurrentAttempt;

  return (
    <Card size="3" className="grid content-between gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Text as="p" size="1" color="gray">
            {assignment.scenarioCode} · сложность {assignment.difficulty}
          </Text>
          <Heading as="h2" size="4">
            {assignment.title}
          </Heading>
          <Text as="p" size="2" color="gray">
            {assignment.scenarioTitle}
          </Text>
        </div>
        <Badge
          color={isCurrentAttempt ? "amber" : exhausted ? "gray" : "green"}
        >
          {isCurrentAttempt
            ? "Выполняется"
            : exhausted
              ? "Попытки исчерпаны"
              : "Доступно"}
        </Badge>
      </div>

      <DataList.Root size="2">
        <DataList.Item>
          <DataList.Label>Режим</DataList.Label>
          <DataList.Value>
            {assignment.type === "card_action" ? "ДДС — карточка" : "Звонок"}
          </DataList.Value>
        </DataList.Item>
        <DataList.Item>
          <DataList.Label>Норматив ответа</DataList.Label>
          <DataList.Value>
            {formatDuration(assignment.answerNormSeconds)}
          </DataList.Value>
        </DataList.Item>
        <DataList.Item>
          <DataList.Label>Проходной балл</DataList.Label>
          <DataList.Value>{assignment.passThreshold}%</DataList.Value>
        </DataList.Item>
        <DataList.Item>
          <DataList.Label>Попытки</DataList.Label>
          <DataList.Value>
            {assignment.usedAttempts} из {assignment.maxAttempts ?? "∞"}
          </DataList.Value>
        </DataList.Item>
        <DataList.Item>
          <DataList.Label>Карточки</DataList.Label>
          <DataList.Value>
            {CARD_SOURCE_LABELS[assignment.cardSource]}
          </DataList.Value>
        </DataList.Item>
        {assignment.dueDate && (
          <DataList.Item>
            <DataList.Label>Срок</DataList.Label>
            <DataList.Value>
              {formatDateTime(assignment.dueDate)}
            </DataList.Value>
          </DataList.Item>
        )}
      </DataList.Root>

      <Button
        disabled={busy || blockedByAnother || (exhausted && !isCurrentAttempt)}
        onClick={isCurrentAttempt ? onContinue : onStart}
        title={
          blockedByAnother
            ? `Сначала завершите «${activeAttempt.assignmentTitle}»`
            : undefined
        }
      >
        <Play size={16} />{" "}
        {isCurrentAttempt
          ? "Продолжить попытку"
          : assignment.type === "card_action"
            ? "Открыть карточку ДДС"
            : "Начать тренировку"}
      </Button>
    </Card>
  );
}
