import { Button, Callout, Card, Flex, Text } from "@bolid-ui/themes";
import { Play, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { DdsExercise } from "../../contracts/dds-exercise";
import { useActiveDdsLessons } from "../../hooks/use-dds-lessons";

const TERMINAL = new Set(["completed", "refused", "lesson_finished"]);

export function DdsActiveLesson({
  current,
  onReady,
}: {
  current?: DdsExercise;
  onReady: (exercise: DdsExercise) => void;
}) {
  const api = useActiveDdsLessons();
  const [lessonId, setLessonId] = useState<string>();
  const [emptyReason, setEmptyReason] = useState<string>();
  const advanced = useRef<string | undefined>(undefined);
  const lessons = api.lessons.data ?? [];
  const selected = lessons.find(({ id }) => id === lessonId);
  const finished = Boolean(
    lessonId &&
    ((current?.lessonId === lessonId && current.status === "lesson_finished") ||
      (api.lessons.isSuccess && !selected)),
  );

  const issueNext = api.next.mutateAsync;
  const takeNext = useCallback(
    async (id: string) => {
      const result = await issueNext(id);
      if (result.status === "ready" && result.exercise) {
        setEmptyReason(undefined);
        onReady(result.exercise);
      } else
        setEmptyReason(result.reason ?? "Ожидайте карточку — очередь пуста");
    },
    [issueNext, onReady],
  );

  useEffect(() => {
    if (!lessonId || !emptyReason || !selected) return;
    const timer = window.setInterval(() => void takeNext(lessonId), 7_000);
    return () => window.clearInterval(timer);
  }, [emptyReason, lessonId, selected, takeNext]);

  useEffect(() => {
    if (
      !lessonId ||
      !current ||
      current.lessonId !== lessonId ||
      !TERMINAL.has(current.status) ||
      advanced.current === current.id
    )
      return;
    advanced.current = current.id;
    // Завершённая сервером карточка — сигнал запросить следующую, а не локальное вычисление состояния.
    // oxlint-disable-next-line react(set-state-in-effect)
    if (current.status !== "lesson_finished") void takeNext(lessonId);
  }, [current, lessonId, takeNext]);

  if (!lessonId && lessons.length === 0) return null;
  if (finished)
    return (
      <Callout.Root color="gray" className="m-2">
        <Callout.Text>Занятие завершено преподавателем.</Callout.Text>
      </Callout.Root>
    );
  if (!lessonId)
    return (
      <Card size="2" className="m-2">
        <Flex align="center" justify="between" gap="3">
          <div>
            <Text weight="bold">Активное занятие ДДС</Text>
            <Text as="p" size="2" color="gray">
              {lessons[0]?.title}
            </Text>
          </div>
          <Button
            onClick={() => {
              const id = lessons[0]?.id;
              if (id) {
                setLessonId(id);
                void takeNext(id);
              }
            }}
          >
            <Play size={15} /> Приступить
          </Button>
        </Flex>
      </Card>
    );
  if (emptyReason)
    return (
      <Callout.Root color="amber" className="m-2">
        <Callout.Text>
          {emptyReason} Повтор через несколько секунд.
        </Callout.Text>
        <Button
          size="1"
          variant="soft"
          disabled={api.next.isPending}
          onClick={() => void takeNext(lessonId)}
        >
          <RefreshCw size={13} /> Проверить сейчас
        </Button>
      </Callout.Root>
    );
  return selected ? (
    <Callout.Root color="blue" className="m-2">
      <Callout.Text>
        Занятие «{selected.title}» идёт. После завершения карточки следующая
        откроется автоматически.
      </Callout.Text>
    </Callout.Root>
  ) : null;
}
