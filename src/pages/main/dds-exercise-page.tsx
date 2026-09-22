import {
  Callout,
  Flex,
  ScrollArea,
  Spinner,
  TextField,
} from "@bolid-ui/themes";
import { AlertTriangle, ChevronUp, Clock3, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useAuthStore } from "../../stores/auth.store";
import { DdsInstructorPanel } from "../../components/dds/dds-instructor-panel";

import { DdsCardPanel } from "../../components/dds/dds-card-panel";
import { DdsExerciseList } from "../../components/dds/dds-exercise-list";
import { DdsShiftPanel } from "../../components/dds/dds-shift-panel";
import type {
  DdsExercise,
  DdsResponseStatus,
} from "../../contracts/dds-exercise";
import { useDdsExercises } from "../../hooks/use-dds-exercises";

type TransitionStatus = Exclude<DdsResponseStatus, "pending">;
const EMPTY_EXERCISES: readonly DdsExercise[] = [];

export default function DdsExercisePage() {
  const role = useAuthStore((state) => state.user?.role);
  return role === "instructor" || role === "admin" ? <DdsInstructorPanel /> : <DdsLearnerPage />;
}

function DdsLearnerPage() {
  const dds = useDdsExercises();
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
  const [appliedExerciseId, setAppliedExerciseId] = useState(requestedExerciseId);

  if (requestedExerciseId !== appliedExerciseId) {
    setAppliedExerciseId(requestedExerciseId);
    if (requestedExerciseId) setSelectedExerciseId(requestedExerciseId);
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
            <Flex align="center" justify="between" gap="2">
              <h1>Поиск происшествий</h1>
              <Search className="arm-dds-search-glass" size={26} />
            </Flex>
            <div className="arm-dds-search-filters">
              <span>расширенный по параметрам</span>
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
          className="arm-dds-toolbar"
          aria-label="Поиск и подача карточек"
        >
          <TextField.Root
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Введите номер, адрес или тип происшествия"
            aria-label="Поиск происшествий"
          >
            <TextField.Slot>
              <Search size={17} />
            </TextField.Slot>
          </TextField.Root>
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

        {dds.exercises.error && (
          <Callout.Root color="red" role="alert" className="m-2">
            <Callout.Icon>
              <AlertTriangle size={16} />
            </Callout.Icon>
            <Callout.Text>{dds.exercises.error.message}</Callout.Text>
          </Callout.Root>
        )}

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
          <DdsExerciseList
            exercises={filtered}
            selectedId={selectedExercise?.id}
            onSelect={setSelectedExerciseId}
          />
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

        <section className="arm-dds-detail" aria-label="Карточка происшествия">
          <DdsCardPanel
            exercise={selectedExercise}
            pending={dds.transition.isPending}
            error={dds.transition.error?.message}
            onTransition={transition}
          />
        </section>
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
