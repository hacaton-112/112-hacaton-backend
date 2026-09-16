import {
  Callout,
  Card,
  Flex,
  Heading,
  ScrollArea,
  Separator,
  Spinner,
  Text,
  toast,
} from "@bolid-ui/themes";
import { AlertTriangle, RadioTower } from "lucide-react";
import { useState } from "react";

import { DdsCardPanel } from "../../components/dds/dds-card-panel";
import { DdsExerciseList } from "../../components/dds/dds-exercise-list";
import { DdsStartPanel } from "../../components/dds/dds-start-panel";
import type { DdsResponseStatus } from "../../contracts/dds-exercise";
import { useDdsExercises } from "../../hooks/use-dds-exercises";
import { useScenarios } from "../../hooks/use-scenarios";

type TransitionStatus = Exclude<DdsResponseStatus, "pending">;

export default function DdsExercisePage() {
  const scenarios = useScenarios();
  const dds = useDdsExercises();
  const list = dds.exercises.data ?? [];
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>();
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>();
  const scenarioId = scenarios.data?.some(
    (scenario) => scenario.scenarioVersionId === selectedScenarioId,
  )
    ? selectedScenarioId
    : scenarios.data?.[0]?.scenarioVersionId;
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
      // The mutation error remains in the start panel callout below.
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
      <div className="mx-auto grid w-full max-w-[1500px] gap-4 p-4">
        <Flex align="center" justify="between" gap="3" wrap="wrap">
          <div>
            <Flex align="center" gap="2">
              <RadioTower size={22} />
              <Heading size="6">Рабочее место ДДС</Heading>
            </Flex>
            <Text as="p" size="2" color="gray" mt="1">
              Принимайте карточки Системы‑112 и фиксируйте этапы реагирования.
            </Text>
          </div>
        </Flex>

        {(dds.exercises.error || scenarios.error) && (
          <Callout.Root color="red" role="alert">
            <Callout.Icon>
              <AlertTriangle size={16} />
            </Callout.Icon>
            <Callout.Text>
              {dds.exercises.error?.message ?? scenarios.error?.message}
            </Callout.Text>
          </Callout.Root>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="grid gap-4 lg:sticky lg:top-4">
            <DdsStartPanel
              scenarios={scenarios.data ?? []}
              selected={scenarioId}
              pending={dds.start.isPending}
              onSelect={setSelectedScenarioId}
              onStart={() => void start()}
            />

            {dds.start.error && (
              <Callout.Root color="red" size="1" role="alert">
                <Callout.Icon>
                  <AlertTriangle size={16} />
                </Callout.Icon>
                <Callout.Text>{dds.start.error.message}</Callout.Text>
              </Callout.Root>
            )}

            <Card size="2" variant="classic" className="grid gap-3">
              <Flex align="center" justify="between">
                <Text size="2" weight="bold">
                  Входящие и завершённые
                </Text>
                {dds.exercises.isFetching && <Spinner size="1" />}
              </Flex>
              <Separator size="4" />
              <DdsExerciseList
                exercises={list}
                selectedId={selectedExercise?.id}
                onSelect={setSelectedExerciseId}
              />
            </Card>
          </div>

          <DdsCardPanel
            exercise={selectedExercise}
            pending={dds.transition.isPending}
            error={dds.transition.error?.message}
            onTransition={transition}
          />
        </div>
      </div>
    </ScrollArea>
  );
}
