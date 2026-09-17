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
import { AlertTriangle, Play } from "lucide-react";
import { useNavigate } from "react-router";

import { ROUTES } from "../../config/routes";
import {
  attemptsLeft,
  type TrainingAssignment,
} from "../../contracts/training";
import { useMyAssignments } from "../../hooks/use-training";
import {
  CARD_SOURCE_LABELS,
  formatDateTime,
  formatDuration,
} from "./training-labels";

/** Лента оператора: только занятия, запущенные его преподавателем. */
export function OperatorAssignmentList() {
  const assignments = useMyAssignments();
  const navigate = useNavigate();

  return (
    <ScrollArea className="h-full" type="auto" scrollbars="vertical">
      <main className="grid w-full gap-4 p-4 md:p-6">
        <header>
          <Heading size="6">Мои назначения</Heading>
          <Text as="p" color="gray" size="2">
            Здесь появляются занятия, которые запустил ваш преподаватель.
          </Text>
        </header>

        {assignments.error && !assignments.data && (
          <Callout.Root color="red" role="alert">
            <Callout.Icon>
              <AlertTriangle size={16} />
            </Callout.Icon>
            <Callout.Text>
              Не удалось получить назначения: {assignments.error.message}
            </Callout.Text>
          </Callout.Root>
        )}

        {assignments.data?.length === 0 && (
          <Card size="3">
            <Text color="gray">Активных назначений пока нет.</Text>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {assignments.isPending
            ? [0, 1, 2, 3].map((index) => (
                <Skeleton
                  key={index}
                  height="260px"
                  className="rounded-(--radius-4)"
                />
              ))
            : assignments.data?.map((assignment) => (
                <OperatorAssignmentCard
                  key={assignment.id}
                  assignment={assignment}
                  onStart={() =>
                    navigate(
                      ROUTES.operatorWithAssignment(
                        assignment.scenarioVersionId,
                        assignment.id,
                      ),
                    )
                  }
                />
              ))}
        </div>
      </main>
    </ScrollArea>
  );
}

function OperatorAssignmentCard({
  assignment,
  onStart,
}: {
  assignment: TrainingAssignment;
  onStart: () => void;
}) {
  const left = attemptsLeft(assignment);
  const exhausted = left === 0;

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
        <Badge color={exhausted ? "gray" : "green"}>
          {exhausted ? "Попытки исчерпаны" : "Доступно"}
        </Badge>
      </div>

      <DataList.Root size="2">
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

      <Button disabled={exhausted} onClick={onStart}>
        <Play size={16} /> Начать тренировку
      </Button>
    </Card>
  );
}
