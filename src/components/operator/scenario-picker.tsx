import { Button, Select } from "@bolid-ui/themes";
import { PhoneIncoming } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";

import type { ScenarioSummary } from "../../contracts/call";
import { useScenarios } from "../../hooks/use-scenarios";
import { SCENARIO_QUERY_PARAM } from "../../config/routes";

interface ScenarioPickerProps {
  disabled: boolean;
  onStart: (
    scenario: Pick<
      ScenarioSummary,
      "scenarioVersionId" | "category" | "title" | "difficulty"
    >,
  ) => void;
}

/** Выбор учебного вызова: список приходит из backend, а не из клиента. */
export function ScenarioPicker({ disabled, onStart }: ScenarioPickerProps) {
  // Каталог сценариев открывает рабочее место уже с выбранным сценарием.
  const [searchParams] = useSearchParams();
  const [selected, setSelected] = useState(
    () => searchParams.get(SCENARIO_QUERY_PARAM) ?? undefined,
  );
  const { data, isPending } = useScenarios();

  const scenarios = data ?? [];
  const current = scenarios.some(
    (scenario) => scenario.scenarioVersionId === selected,
  )
    ? selected
    : scenarios[0]?.scenarioVersionId;
  const chosen = scenarios.find(
    (scenario) => scenario.scenarioVersionId === current,
  );

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Select.Root
        value={current ?? ""}
        onValueChange={setSelected}
        disabled={isPending || scenarios.length === 0}
      >
        <Select.Trigger
          placeholder="Сценарий вызова"
          className="min-w-0 flex-1 sm:min-w-52"
        />
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

      <Button
        color="green"
        radius="full"
        disabled={disabled || !chosen}
        onClick={() => chosen && onStart(chosen)}
        aria-label="Запустить выбранный сценарий"
        title="Запустить выбранный сценарий"
        className="shrink-0"
      >
        <PhoneIncoming size={17} />
        <span className="hidden xl:inline">Начать звонок</span>
      </Button>
    </div>
  );
}
