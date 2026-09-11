import { Button, Flex, Select, Text } from "@bolid-ui/themes";
import { PhoneIncoming } from "lucide-react";
import { useState } from "react";

import type { ScenarioSummary } from "../../contracts/call";
import { useScenarios } from "../../hooks/use-scenarios";

interface ScenarioPickerProps {
  disabled: boolean;
  onStart: (
    scenario: Pick<ScenarioSummary, "scenarioVersionId" | "category">,
  ) => void;
}

const DIFFICULTY_LABELS = [
  "",
  "очень просто",
  "просто",
  "средне",
  "сложно",
  "очень сложно",
];

/** Выбор учебного вызова: список приходит из backend, а не из клиента. */
export function ScenarioPicker({ disabled, onStart }: ScenarioPickerProps) {
  const [selected, setSelected] = useState<string>();
  const { data, isPending } = useScenarios();

  const scenarios = data ?? [];
  const current = selected ?? scenarios[0]?.scenarioVersionId;
  const chosen = scenarios.find(
    (scenario) => scenario.scenarioVersionId === current,
  );

  return (
    <Flex direction="column" gap="2" mt="5">
      <Select.Root
        value={current ?? ""}
        onValueChange={setSelected}
        disabled={isPending || scenarios.length === 0}
      >
        <Select.Trigger placeholder="Сценарий вызова" />
        <Select.Content>
          {scenarios.map((scenario) => (
            <Select.Item
              key={scenario.scenarioVersionId}
              value={scenario.scenarioVersionId}
            >
              {scenario.code} · {scenario.title}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>

      {chosen && (
        <Text size="1" color="gray">
          {chosen.summary} Сложность: {DIFFICULTY_LABELS[chosen.difficulty]}.
        </Text>
      )}

      <Button
        variant="soft"
        disabled={disabled || !chosen}
        onClick={() => chosen && onStart(chosen)}
      >
        <PhoneIncoming size={15} /> Принять учебный вызов
      </Button>
    </Flex>
  );
}
