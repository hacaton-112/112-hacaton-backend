import {
  Button,
  Card,
  Callout,
  Heading,
  ScrollArea,
  Spinner,
  Text,
  TextField,
} from "@bolid-ui/themes";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronUp,
  Clock3,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ROUTES } from "../../config/routes";
import { useAuthStore } from "../../stores/auth.store";
import { DdsInstructorPanel } from "../../components/dds/dds-instructor-panel";

import { DdsCardPanel } from "../../components/dds/dds-card-panel";
import { DdsExerciseList } from "../../components/dds/dds-exercise-list";
import { DdsShiftPanel } from "../../components/dds/dds-shift-panel";
import { DdsActiveLesson } from "../../components/dds/dds-active-lesson";
import type {
  DdsExercise,
  DdsResponseStatus,
} from "../../contracts/dds-exercise";
import { useDdsExercises } from "../../hooks/use-dds-exercises";

type TransitionStatus = Exclude<
  DdsResponseStatus,
  "pending" | "lesson_finished"
>;
const EMPTY_EXERCISES: readonly DdsExercise[] = [];

export default function DdsExercisePage() {
  const role = useAuthStore((state) => state.user?.role);
  return role === "instructor" || role === "admin" ? (
    <DdsInstructorPanel />
  ) : (
    <DdsLearnerPage />
  );
}

function DdsLearnerPage() {
  const dds = useDdsExercises();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const list = dds.exercises.data ?? EMPTY_EXERCISES;
  const [query, setQuery] = useState("");
  const requestedExerciseId = searchParams.get("exercise") ?? undefined;
  const [selectedExerciseId, setSelectedExerciseId] = useState<
    string | undefined
  >(requestedExerciseId);

  // Ссылка из списка назначений может смениться, пока рабочее место открыто:
  // диспетчер начал вторую попытку и должен увидеть новую карточку. Правка
  // состояния во время отрисовки — штатный приём React для такой синхронизации,
  // эффект здесь дал бы лишний проход отрисовки.
  const [appliedExerciseId, setAppliedExerciseId] =
    useState(requestedExerciseId);

  if (requestedExerciseId !== appliedExerciseId) {
    setAppliedExerciseId(requestedExerciseId);
    setSelectedExerciseId(requestedExerciseId);
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru-RU");
    if (!needle) return list;

    return list.filter((exercise) =>
      [
        exercise.card.scenarioCode,
        exercise.card.title,
        exercise.card.incidentType,
        exercise.card.addressText,
      ].some((value) => value.toLocaleLowerCase("ru-RU").includes(needle)),
    );
  }, [list, query]);

  const selectedExercise =
    list.find((exercise) => exercise.id === selectedExerciseId) ??
    list.find(
      (exercise) =>
        exercise.status !== "completed" && exercise.status !== "refused",
    ) ??
    list[0];
  const isCardFocused = selectedExerciseId !== undefined;

  const returnToQueue = () => {
    setSelectedExerciseId(undefined);
    navigate(ROUTES.dds(), { replace: true });
  };

  const focusExercise = useCallback(
    (exerciseId: string) => {
      setSelectedExerciseId(exerciseId);
      navigate(ROUTES.ddsExercise(exerciseId), { replace: true });
    },
    [navigate],
  );

  const transition = async (status: TransitionStatus, comment?: string) => {
    if (!selectedExercise) return;

    const updated = await dds.transition.mutateAsync({
      exerciseId: selectedExercise.id,
      status,
      comment,
    });
    setSelectedExerciseId(updated.id);
  };

  return (
    <ScrollArea className="h-full" scrollbars="vertical" type="auto">
      <main className="arm-dds-page min-h-full w-full">
        <header className="arm-dds-search-header">
          <div>
            <TextField.Root
              className="arm-dds-primary-search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Поиск происшествий"
              aria-label="Поиск происшествий"
            >
              <TextField.Slot side="right">
                <Search className="arm-dds-search-glass" size={26} />
              </TextField.Slot>
            </TextField.Root>
            <div className="arm-dds-search-filters">
              <span>номер, адрес, сценарий или тип происшествия</span>
              <button
                type="button"
                onClick={() => setQuery("")}
                disabled={query === ""}
              >
                сбросить
              </button>
            </div>
          </div>
          <DdsClock />
        </header>

        <section
          className="arm-dds-toolbar arm-dds-toolbar-single"
          aria-label="Состояние смены ДДС"
        >
          <DdsShiftPanel
            fetching={dds.exercises.isFetching}
            incoming={
              list.filter(
                (exercise) =>
                  exercise.status !== "completed" &&
                  exercise.status !== "refused",
              ).length
            }
          />
        </section>

        <DdsActiveLesson
          current={selectedExercise}
          onReady={(exercise) => focusExercise(exercise.id)}
        />

        {dds.exercises.error && (
          <Callout.Root color="red" role="alert" className="m-2">
            <Callout.Icon>
              <AlertTriangle size={16} />
            </Callout.Icon>
            <Callout.Text>{dds.exercises.error.message}</Callout.Text>
          </Callout.Root>
        )}

        {!dds.exercises.isPending &&
          !dds.exercises.error &&
          list.length === 0 && (
            <Card size="3" className="m-2 grid gap-3">
              <Heading size="4">Как получить карточку ДДС</Heading>
              <Text as="p" size="2" color="gray">
                В этом окне карточка вручную не создаётся. Откройте назначение
                преподавателя в режиме «Диспетчер ДДС» — карточка появится при
                старте попытки. Сюда также поступают карточки, отправленные из
                рабочего места оператора 112 в службу вашей учебной группы (тег
                01, 02, 03 или 04).
              </Text>
              <div>
                <Button
                  type="button"
                  variant="soft"
                  onClick={() => navigate(ROUTES.assignments())}
                >
                  Открыть мои назначения
                </Button>
              </div>
            </Card>
          )}

        {!isCardFocused && (
          <section className="arm-dds-queue" aria-labelledby="dds-queue-title">
            <div className="arm-dds-section-title">
              <strong id="dds-queue-title">
                Список происшествий <ChevronUp size={15} />
              </strong>
              <span>
                {dds.exercises.isFetching && <Spinner size="1" />}{" "}
                {filtered.length}
                {" из "}
                {list.length}
              </span>
            </div>
            <DdsExerciseList exercises={filtered} onSelect={focusExercise} />
            {filtered.length > 0 && (
              <div className="arm-dds-pagination">
                <span>Страница: 1</span>
                <span>Записей на странице: {filtered.length}</span>
                <strong>
                  1-{filtered.length} из {list.length}
                </strong>
              </div>
            )}
          </section>
        )}

        {isCardFocused && (
          <>
            <div className="arm-dds-card-navigation">
              <Button type="button" variant="soft" onClick={returnToQueue}>
                <ArrowLeft size={16} /> К списку происшествий
              </Button>
            </div>
            <section
              className="arm-dds-detail"
              aria-label="Карточка происшествия"
            >
              <DdsCardPanel
                exercise={selectedExercise}
                pending={dds.transition.isPending}
                error={dds.transition.error?.message}
                onTransition={transition}
              />
            </section>
          </>
        )}
      </main>
    </ScrollArea>
  );
}

function DdsClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="arm-dds-clock">
      <span>
        <Clock3 size={13} />
        {now.toLocaleDateString("ru-RU", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </span>
      <strong>
        {now.toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </strong>
    </div>
  );
}
