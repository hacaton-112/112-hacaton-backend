import {
  Badge,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Select,
  Text,
  TextField,
  toast,
} from "@bolid-ui/themes";
import {
  AlertTriangle,
  Clock3,
  FileChartColumn,
  Plus,
  Square,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { ROUTES } from "../../config/routes";
import {
  DDS_LESSON_CARD_SOURCES,
  type DdsLessonCardSource,
} from "../../contracts/dds-lesson";
import { SCENARIO_CATEGORIES } from "../../contracts/scenario-authoring";
import { useInstructorDdsLessons } from "../../hooks/use-dds-lessons";
import { useStudents, useTrainingGroups } from "../../hooks/use-training";
import {
  DDS_CATEGORY_LABELS,
  DDS_SERVICE_LABELS,
  DDS_STATUS_LABELS,
} from "./dds-formatters";
import { DdsReferenceEditor } from "./dds-reference-editor";
import { DdsTextResult } from "./dds-card-panel";

const SOURCE_LABELS: Record<DdsLessonCardSource, string> = {
  generated: "Сгенерированные системой",
  operator_call: "От операторов 112",
  mixed: "Смешанные",
};
type ScenarioCategory = (typeof SCENARIO_CATEGORIES)[number];

export function DdsLessonsPanel() {
  const navigate = useNavigate();
  const api = useInstructorDdsLessons();
  const groups = useTrainingGroups();
  const students = useStudents();
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [categories, setCategories] = useState<ScenarioCategory[]>(["fire"]);
  const [source, setSource] = useState<DdsLessonCardSource>("generated");
  const [norm, setNorm] = useState("30");
  const [threshold, setThreshold] = useState("75");
  const [selectedId, setSelectedId] = useState<string>();
  const lessons = api.lessons.data ?? [];
  const selected = lessons.find(({ id }) => id === selectedId) ?? lessons[0];

  const canCreate =
    target !== "" && title.trim().length >= 2 && categories.length > 0;
  const targetInput = useMemo(() => {
    const [kind, id] = target.split(":");
    return kind === "group" ? { groupId: id } : { targetUserId: id };
  }, [target]);

  const create = async () => {
    if (!canCreate) return;
    const lesson = await api.create.mutateAsync({
      ...targetInput,
      title: title.trim(),
      categories,
      cardSource: source,
      acknowledgementNormSeconds: Number(norm),
      passThreshold: Number(threshold),
    });
    setSelectedId(lesson.id);
    setTitle("");
    toast.success("Занятие ДДС начато");
  };

  return (
    <section className="grid gap-4">
      <Card size="3" className="grid gap-4">
        <Flex align="center" justify="between" gap="3" wrap="wrap">
          <div>
            <Heading size="4">Начать занятие ДДС</Heading>
            <Text as="p" size="2" color="gray">
              Сервер сам выдаёт карточки и считает нормативы и баллы.
            </Text>
          </div>
          <Button
            disabled={!canCreate || api.create.isPending}
            onClick={() => void create()}
          >
            <Plus size={16} /> Начать занятие
          </Button>
        </Flex>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1">
            <Text size="2" weight="bold">
              Группа или ученик
            </Text>
            <Select.Root value={target} onValueChange={setTarget}>
              <Select.Trigger placeholder="Выберите получателя" />
              <Select.Content>
                {(groups.data ?? [])
                  .filter(({ status }) => status === "active")
                  .map((group) => (
                    <Select.Item key={group.id} value={`group:${group.id}`}>
                      Группа · {group.name}
                    </Select.Item>
                  ))}
                {(students.data ?? []).map((student) => (
                  <Select.Item key={student.id} value={`student:${student.id}`}>
                    Ученик · {student.fullName}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </label>
          <label className="grid gap-1">
            <Text size="2" weight="bold">
              Название
            </Text>
            <TextField.Root
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="grid gap-1">
            <Text size="2" weight="bold">
              Источник карточек
            </Text>
            <Select.Root
              value={source}
              onValueChange={(value) => setSource(value as DdsLessonCardSource)}
            >
              <Select.Trigger />
              <Select.Content>
                {DDS_LESSON_CARD_SOURCES.map((value) => (
                  <Select.Item key={value} value={value}>
                    {SOURCE_LABELS[value]}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </label>
          <Flex gap="2">
            <label className="grid flex-1 gap-1">
              <Text size="2" weight="bold">
                Норматив, сек.
              </Text>
              <TextField.Root
                type="number"
                min="10"
                max="300"
                value={norm}
                onChange={(event) => setNorm(event.target.value)}
              />
            </label>
            <label className="grid flex-1 gap-1">
              <Text size="2" weight="bold">
                Проходной балл
              </Text>
              <TextField.Root
                type="number"
                min="50"
                max="100"
                value={threshold}
                onChange={(event) => setThreshold(event.target.value)}
              />
            </label>
          </Flex>
        </div>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">Категории событий</legend>
          <Flex gap="3" wrap="wrap">
            {SCENARIO_CATEGORIES.map((category) => (
              <label key={category} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={categories.includes(category)}
                  onChange={(event) =>
                    setCategories((current) =>
                      event.target.checked
                        ? [...new Set([...current, category])]
                        : current.filter((value) => value !== category),
                    )
                  }
                />
                {DDS_CATEGORY_LABELS[category]}
              </label>
            ))}
          </Flex>
        </fieldset>
        {(api.create.error || api.lessons.error) && (
          <Callout.Root color="red">
            <Callout.Icon>
              <AlertTriangle size={16} />
            </Callout.Icon>
            <Callout.Text>
              {(api.create.error ?? api.lessons.error)?.message}
            </Callout.Text>
          </Callout.Root>
        )}
      </Card>

      {lessons.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card size="2" className="grid content-start gap-2">
            {lessons.map((lesson) => (
              <Button
                key={lesson.id}
                variant={lesson.id === selected?.id ? "solid" : "soft"}
                onClick={() => setSelectedId(lesson.id)}
              >
                {lesson.title} ·{" "}
                {lesson.status === "active" ? "идёт" : "завершено"}
              </Button>
            ))}
          </Card>
          {selected && (
            <LessonDetails
              lesson={selected}
              onFinish={() => api.finish.mutateAsync(selected.id)}
              pending={api.finish.isPending}
              onOpenReport={() => navigate(ROUTES.ddsLessonReport(selected.id))}
            />
          )}
        </div>
      )}
    </section>
  );
}

function LessonDetails({
  lesson,
  onFinish,
  pending,
  onOpenReport,
}: {
  lesson: NonNullable<
    ReturnType<typeof useInstructorDdsLessons>["lessons"]["data"]
  >[number];
  onFinish: () => Promise<unknown>;
  pending: boolean;
  onOpenReport: () => void;
}) {
  const currentByUser = new Map(
    lesson.cards
      .filter(({ exercise }) => exercise.completedAt === null)
      .map((card) => [card.operatorId, card]),
  );
  const referenceCard = lesson.cards.find(
    ({ exercise }) => exercise.sourceTrainingSessionId === null,
  );
  return (
    <Card size="3" className="grid gap-4">
      <Flex align="start" justify="between" gap="3" wrap="wrap">
        <div>
          <Heading size="4">{lesson.title}</Heading>
          <Text size="2" color="gray">
            {SOURCE_LABELS[lesson.cardSource]} · норматив{" "}
            {lesson.acknowledgementNormSeconds} сек.
          </Text>
        </div>
        {lesson.status === "active" ? (
          <Button
            color="red"
            variant="soft"
            disabled={pending}
            onClick={() =>
              window.confirm("Завершить занятие для всех участников?") &&
              void onFinish()
            }
          >
            <Square size={14} /> Завершить занятие
          </Button>
        ) : (
          <Button variant="soft" onClick={onOpenReport}>
            <FileChartColumn size={14} /> Отчёт
          </Button>
        )}
      </Flex>
      {lesson.skippedParticipants.length > 0 && (
        <Callout.Root color="amber">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>
            Не включены в занятие:{" "}
            {lesson.skippedParticipants
              .map(
                ({ fullName, serviceTag }) =>
                  `${fullName}${serviceTag ? ` (${serviceTag})` : ""}`,
              )
              .join(", ")}
            . Для этих участников не распознана служба ДДС.
          </Callout.Text>
        </Callout.Root>
      )}
      <div className="grid gap-2 md:grid-cols-2">
        {lesson.participants.map((participant) => {
          const current = currentByUser.get(participant.userId);
          return (
            <Card key={participant.userId} size="2" variant="surface">
              <Flex justify="between" gap="2">
                <Text weight="bold">{participant.fullName}</Text>
                {participant.service && (
                  <Badge>{DDS_SERVICE_LABELS[participant.service]}</Badge>
                )}
              </Flex>
              <Text as="p" size="2" color="gray" mt="1">
                {current
                  ? `${current.exercise.card.title} · ${DDS_STATUS_LABELS[current.exercise.status]}`
                  : "Ожидает или завершил карточку"}
              </Text>
              {current?.exercise.acknowledgedAt === null && (
                <Text as="p" size="1" color="orange">
                  <Clock3 size={12} className="inline" /> до{" "}
                  {new Date(
                    current.exercise.acknowledgementDeadlineAt,
                  ).toLocaleTimeString("ru-RU")}
                </Text>
              )}
            </Card>
          );
        })}
      </div>
      {referenceCard && (
        <DdsReferenceEditor
          versionId={referenceCard.exercise.scenarioVersionId}
        />
      )}
      <div>
        <Heading size="3">Завершённые карточки</Heading>
        {lesson.cards
          .filter(({ exercise }) => exercise.completedAt !== null)
          .map(({ exercise, operatorName }) => (
            <div key={exercise.id} className="mt-3 grid gap-2">
              <Flex justify="between" gap="3">
                <Text size="2">
                  {operatorName} · {exercise.card.title}
                </Text>
                <Badge
                  color={
                    exercise.result?.passed
                      ? "green"
                      : exercise.status === "lesson_finished"
                        ? "gray"
                        : "red"
                  }
                >
                  {exercise.status === "lesson_finished"
                    ? "Без оценки"
                    : `${exercise.result?.score ?? "—"} баллов`}
                </Badge>
              </Flex>
              {exercise.result && (
                <DdsTextResult
                  exerciseId={exercise.id}
                  evaluation={exercise.textEvaluation}
                  instructorView
                />
              )}
            </div>
          ))}
      </div>
    </Card>
  );
}
