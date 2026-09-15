import { Badge, Button, Card, Flex, Text } from "@bolid-ui/themes";
import { ChevronRight, Inbox } from "lucide-react";

import type { DdsExercise } from "../../contracts/dds-exercise";
import { DDS_SERVICE_LABELS, DDS_STATUS_LABELS } from "./dds-formatters";

export function DdsExerciseList({
  exercises,
  selectedId,
  onSelect,
}: {
  exercises: readonly DdsExercise[];
  selectedId?: string;
  onSelect: (exerciseId: string) => void;
}) {
  if (exercises.length === 0) {
    return (
      <Card size="2" variant="surface">
        <Flex align="center" gap="2">
          <Inbox size={18} />
          <Text size="2" color="gray">
            Поступивших учебных карточек пока нет.
          </Text>
        </Flex>
      </Card>
    );
  }

  return (
    <div className="grid gap-2">
      {exercises.map((exercise) => {
        const terminal =
          exercise.status === "completed" || exercise.status === "refused";

        return (
          <Button
            key={exercise.id}
            type="button"
            variant={selectedId === exercise.id ? "soft" : "ghost"}
            color={terminal ? "gray" : "blue"}
            className="h-auto! w-full justify-between! p-3! text-left"
            onClick={() => onSelect(exercise.id)}
          >
            <span className="min-w-0">
              <Text as="span" size="2" weight="medium" truncate>
                {exercise.card.scenarioCode} · {exercise.card.title}
              </Text>
              <Text as="span" size="1" color="gray" className="block" truncate>
                {DDS_SERVICE_LABELS[exercise.addressedService]}
              </Text>
            </span>
            <Flex align="center" gap="2" className="shrink-0">
              <Badge
                color={
                  exercise.status === "completed"
                    ? "green"
                    : exercise.status === "refused"
                      ? "red"
                      : "amber"
                }
                variant="soft"
              >
                {DDS_STATUS_LABELS[exercise.status]}
              </Badge>
              <ChevronRight size={16} />
            </Flex>
          </Button>
        );
      })}
    </div>
  );
}
