import {
  Callout,
  Flex,
  ScrollArea,
  Spinner,
  Text,
  TextField,
  toast,
} from "@bolid-ui/themes";
import { AlertTriangle, Clock3, RadioTower, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { DdsCardPanel } from "../../components/dds/dds-card-panel";
import { DdsExerciseList } from "../../components/dds/dds-exercise-list";
import { DdsStartPanel } from "../../components/dds/dds-start-panel";
import type {
  DdsExercise,
  DdsResponseStatus,
} from "../../contracts/dds-exercise";
import { useDdsExercises } from "../../hooks/use-dds-exercises";
import { useScenarios } from "../../hooks/use-scenarios";

type TransitionStatus = Exclude<DdsResponseStatus, "pending">;
const EMPTY_EXERCISES: readonly DdsExercise[] = [];

export default function DdsExercisePage() {
  const scenarios = useScenarios();
  const dds = useDdsExercises();
  const list = dds.exercises.data ?? EMPTY_EXERCISES;
  const [query, setQuery] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>();
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>();
  const scenarioId = scenarios.data?.some(
    (scenario) => scenario.scenarioVersionId === selectedScenarioId,
  )
    ? selectedScenarioId
    : scenarios.data?.[0]?.scenarioVersionId;

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

  const start = async () => {
    if (!scenarioId) return;

    try {
      const exercise = await dds.start.mutateAsync(scenarioId);
      setSelectedExerciseId(exercise.id);
      toast.success("Учебная карточка поступила", {
        description: `${exercise.card.scenarioCode} · ${exercise.card.title}`,
      });
    } catch {
      // The mutation error remains in the source panel below.
    }
  };

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
            <Flex align="center" gap="2">
              <RadioTower size={22} />
              <h1>Поиск происшествий</h1>
            </Flex>
            <Text as="p" size="1">
              Рабочее место дежурно-диспетчерской службы
            </Text>
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
          <DdsStartPanel
            scenarios={scenarios.data ?? []}
            selected={scenarioId}
            pending={dds.start.isPending}
            onSelect={setSelectedScenarioId}
            onStart={() => void start()}
          />
        </section>

        {(dds.exercises.error || scenarios.error || dds.start.error) && (
          <Callout.Root color="red" role="alert" className="m-2">
            <Callout.Icon>
              <AlertTriangle size={16} />
            </Callout.Icon>
            <Callout.Text>
              {dds.exercises.error?.message ??
                scenarios.error?.message ??
                dds.start.error?.message}
            </Callout.Text>
          </Callout.Root>
        )}

        <section className="arm-dds-queue" aria-labelledby="dds-queue-title">
          <div className="arm-dds-section-title">
            <strong id="dds-queue-title">Список происшествий</strong>
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
