import {
  Badge,
  Button,
  Callout,
  Card,
  Heading,
  Select,
  Spinner,
  Text,
  TextArea,
  TextField,
} from "@bolid-ui/themes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type {
  DdsStandaloneResult,
  DdsTrainingAttempt,
} from "../../contracts/dds-training";
import { ddsTrainingService } from "../../services/dds-training.service";
import { DdsCardPanel } from "./dds-card-panel";
import { DdsAssignmentCreator } from "./dds-assignment-creator";
import { DDS_STATUS_LABELS } from "./dds-formatters";

const queryKey = ["dds-training-attempts"] as const;

export function DdsInstructorPanel() {
  const attempts = useQuery({
    queryKey,
    queryFn: ddsTrainingService.list,
    refetchInterval: 3_000,
  });
  const [selectedId, setSelectedId] = useState<string>();
  const records: InstructorDdsRecord[] = [
    ...(attempts.data?.attempts.map((attempt) => ({
      kind: "assigned" as const,
      attempt,
    })) ?? []),
    ...(attempts.data?.standaloneResults.map((result) => ({
      kind: "standalone" as const,
      result,
    })) ?? []),
  ];
  const selected =
    records.find((item) => exerciseOf(item).id === selectedId) ?? records[0];
  return (
    <main className="h-full overflow-auto p-4 md:p-6">
      <div className="mx-auto grid max-w-6xl gap-4">
        <header>
          <Heading size="6">Занятия ДДС — карточки</Heading>
          <Text as="p" color="gray">
            Здесь отображаются попытки и результаты. Сама карточка создаётся при
            старте назначения учеником либо поступает после отправки из рабочего
            места оператора 112.
          </Text>
        </header>
        <DdsAssignmentCreator />
        {attempts.isPending && <Spinner />}
        {attempts.error && (
          <Callout.Root color="red" role="alert">
            <Callout.Text>{attempts.error.message}</Callout.Text>
          </Callout.Root>
        )}
        {attempts.data && records.length === 0 && (
          <Card>Обучающиеся ещё не завершали доступные вам карточки.</Card>
        )}
        {selected && (
          <>
            <Select.Root
              value={exerciseOf(selected).id}
              onValueChange={setSelectedId}
            >
              <Select.Trigger aria-label="Попытка обучающегося" />
              <Select.Content>
                {records.map((item) => (
                  <Select.Item
                    key={exerciseOf(item).id}
                    value={exerciseOf(item).id}
                  >
                    {recordLabel(item)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
            <DdsCardPanel
              exercise={exerciseOf(selected)}
              pending={false}
              readOnly
              onTransition={async () => {}}
            />
            {selected.kind === "assigned" ? (
              <DdsAssessment
                key={selected.attempt.exercise.id}
                attempt={selected.attempt}
              />
            ) : (
              <DdsStandaloneAssessment
                key={selected.result.exercise.id}
                result={selected.result}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}

type InstructorDdsRecord =
  | { kind: "assigned"; attempt: DdsTrainingAttempt }
  | { kind: "standalone"; result: DdsStandaloneResult };

const exerciseOf = (record: InstructorDdsRecord) =>
  record.kind === "assigned" ? record.attempt.exercise : record.result.exercise;

const recordLabel = (record: InstructorDdsRecord) => {
  if (record.kind === "standalone") {
    return `${record.result.operatorName} · Вне учебного назначения · ${record.result.exercise.card.title}`;
  }
  const { attempt } = record;
  const status =
    attempt.attemptStatus === "cancelled_by_instructor"
      ? "Остановлена"
      : DDS_STATUS_LABELS[attempt.exercise.status];
  return `${attempt.operatorName} · ${attempt.assignmentTitle} · попытка ${attempt.attemptNumber} · ${status}`;
};

function DdsStandaloneAssessment({ result }: { result: DdsStandaloneResult }) {
  const automatic = result.exercise.result;
  return (
    <Card className="grid gap-3" size="3">
      <Heading size="4">Автоматический результат</Heading>
      <Badge color={automatic?.passed ? "green" : "red"} size="2">
        {automatic
          ? `${automatic.score} из 100 · ${automatic.passed ? "Зачёт" : "Незачёт"}`
          : "Результат не рассчитан"}
      </Badge>
      <Text size="2" color="gray">
        Проходной балл: {result.passThreshold}. Карточка выполнена вне учебного
        назначения, поэтому доступна только для просмотра и не может получить
        преподавательскую оценку.
      </Text>
    </Card>
  );
}

function DdsAssessment({ attempt }: { attempt: DdsTrainingAttempt }) {
  const client = useQueryClient();
  const [score, setScore] = useState(
    String(attempt.reviews[0]?.score ?? attempt.exercise.result?.score ?? 0),
  );
  const [comment, setComment] = useState("");
  const reviewCommand = useRef<{ key: string; eventId: string } | null>(null);
  const refresh = async () => {
    await client.invalidateQueries({ queryKey });
  };
  const review = useMutation({
    mutationFn: async () => {
      const key = JSON.stringify([Number(score), comment.trim()]);
      if (reviewCommand.current?.key !== key)
        reviewCommand.current = { key, eventId: crypto.randomUUID() };
      await ddsTrainingService.review(attempt.exercise.id, {
        eventId: reviewCommand.current.eventId,
        score: Number(score),
        comment: comment.trim(),
      });
    },
    retry: false,
    onSuccess: async () => {
      reviewCommand.current = null;
      setComment("");
      await refresh();
    },
  });
  const stop = useMutation({
    mutationFn: () =>
      ddsTrainingService.stop(attempt.exercise.id, comment.trim()),
    retry: false,
    onSuccess: refresh,
  });
  const closed = attempt.exercise.completedAt !== null;
  const pending = review.isPending || stop.isPending;
  const invalidScore =
    score.trim() === "" ||
    !Number.isInteger(Number(score)) ||
    Number(score) < 0 ||
    Number(score) > 100;
  const error = review.error ?? stop.error;
  return (
    <Card className="grid gap-3" size="3">
      <Heading size="4">Оценка преподавателя</Heading>
      <Text size="2" color="gray">
        Автоматический балл — предварительный, по текущим правилам тренажёра.
        Проверьте компетенцию службы и обоснованность комментариев. Ваша оценка
        хранится отдельно; проходной балл занятия — {attempt.passThreshold}.
      </Text>
      {closed ? (
        <label>
          <Text as="div" size="2">
            Балл, 0–100
          </Text>
          <TextField.Root
            aria-label="Балл преподавателя"
            type="number"
            min={0}
            max={100}
            step={1}
            value={score}
            disabled={pending}
            onChange={(event) => setScore(event.target.value)}
          />
        </label>
      ) : (
        <Text color="amber">
          Попытка ещё идёт. Дождитесь завершения или остановите её с указанием
          причины.
        </Text>
      )}
      <label>
        <Text as="div" size="2">
          {closed ? "Обоснование оценки" : "Причина остановки"}
        </Text>
        <TextArea
          aria-label={closed ? "Обоснование оценки" : "Причина остановки"}
          value={comment}
          disabled={pending}
          onChange={(event) => setComment(event.target.value)}
          maxLength={1_000}
        />
      </label>
      {closed ? (
        <Button
          disabled={pending || invalidScore || comment.trim().length < 3}
          onClick={() => review.mutate()}
        >
          Сохранить оценку
        </Button>
      ) : (
        <Button
          color="red"
          disabled={pending || comment.trim().length < 3}
          onClick={() => stop.mutate()}
        >
          Остановить попытку
        </Button>
      )}
      {error && (
        <Callout.Root color="red" role="alert">
          <Callout.Text>{error.message}</Callout.Text>
        </Callout.Root>
      )}
      {attempt.reviews.map((item) => (
        <div key={item.eventId} className="border-gray-6 border-t pt-3">
          <Text as="p" weight="bold">
            {item.score} баллов ·{" "}
            {item.score >= attempt.passThreshold ? "Зачёт" : "Незачёт"} ·{" "}
            {new Date(item.createdAt).toLocaleString("ru-RU")}
          </Text>
          <Text as="p" size="2" className="whitespace-pre-wrap">
            {item.comment}
          </Text>
        </div>
      ))}
    </Card>
  );
}
