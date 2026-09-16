import { Button, Card, Select, Spinner, Text } from "@bolid-ui/themes";
import { Play } from "lucide-react";

import type { ScenarioSummary } from "../../contracts/call";

export function DdsStartPanel({
  scenarios,
  selected,
  pending,
  onSelect,
  onStart,
}: {
  scenarios: readonly ScenarioSummary[];
  selected?: string;
  pending: boolean;
  onSelect: (scenarioVersionId: string) => void;
  onStart: () => void;
}) {
  return (
    <Card size="2" variant="classic" className="grid gap-3">
      <div>
        <Text as="p" size="2" weight="bold">
          Новая учебная карточка
        </Text>
        <Text as="p" size="1" color="gray">
          До подключения назначений преподавателя карточка создаётся из
          опубликованного сценария.
        </Text>
      </div>
      <Select.Root
        value={selected ?? ""}
        onValueChange={onSelect}
        disabled={pending || scenarios.length === 0}
      >
        <Select.Trigger className="w-full" placeholder="Выберите сценарий" />
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
        type="button"
        color="blue"
        disabled={pending || !selected}
        onClick={onStart}
      >
        {pending ? <Spinner size="1" /> : <Play size={16} />}
        {pending ? "Создаём…" : "Начать упражнение"}
      </Button>
    </Card>
  );
}
