import { Button, IconButton, Select } from "@bolid-ui/themes";
import { MessageSquareText, PhoneIncoming } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";

import type { CallChannel, ScenarioSummary } from "../../contracts/call";
import { attemptsLeft } from "../../contracts/training";
import {
  ASSIGNMENT_QUERY_PARAM,
  SCENARIO_QUERY_PARAM,
} from "../../config/routes";
import { useScenarios } from "../../hooks/use-scenarios";
import { useMyAssignments } from "../../hooks/use-training";
import { useAuthStore } from "../../stores/auth.store";

interface ScenarioPickerProps {
  disabled: boolean;
  onStart: (
    scenario: Pick<
      ScenarioSummary,
      "scenarioVersionId" | "category" | "title" | "difficulty"
    > & { assignmentId?: string },
    channel?: CallChannel,
  ) => void;
}

/** Выбор учебного вызова: список приходит из backend, а не из клиента. */
export function ScenarioPicker({ disabled, onStart }: ScenarioPickerProps) {
  // Каталог сценариев открывает рабочее место уже с выбранным сценарием.
  const [searchParams] = useSearchParams();
  const role = useAuthStore((state) => state.user?.role);
  const isOperator = role === "operator";
  const [selected, setSelected] = useState(
    () => searchParams.get(SCENARIO_QUERY_PARAM) ?? undefined,
  );
  const { data, isPending } = useScenarios();
  const { data: assignmentOverview, isPending: assignmentsPending } =
    useMyAssignments(isOperator);
  const assignments = assignmentOverview?.assignments;
  const activeAttempt = assignmentOverview?.activeAttempt;

  const scenarios = data ?? [];
  const current = scenarios.some(
    (scenario) => scenario.scenarioVersionId === selected,
  )
    ? selected
    : scenarios[0]?.scenarioVersionId;
  const chosen = scenarios.find(
    (scenario) => scenario.scenarioVersionId === current,
  );
  const requestedAssignmentId = searchParams.get(ASSIGNMENT_QUERY_PARAM);
  const assignment = assignments?.find(
    (item) =>
      item.scenarioVersionId === current &&
      (requestedAssignmentId === null || item.id === requestedAssignmentId),
  );
  // Оператор начинает звонок только по назначению, где остались попытки.
  const blockedReason = !isOperator
    ? undefined
    : assignmentsPending
      ? "Загружаем назначения"
      : activeAttempt
        ? `Уже выполняется «${activeAttempt.assignmentTitle}»`
        : !assignment
          ? "Сценарий не назначен"
          : attemptsLeft(assignment) === 0
            ? "Попытки по назначению исчерпаны"
            : undefined;

  const start = (channel: CallChannel) => {
    if (!chosen) return;
    onStart(
      { ...chosen, assignmentId: isOperator ? assignment?.id : undefined },
      channel,
    );
  };

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
        color="orange"
        disabled={disabled || !chosen || blockedReason !== undefined}
        onClick={() => chosen && start("voice")}
        aria-label="Запустить выбранный сценарий"
        title={blockedReason ?? "Запустить выбранный сценарий"}
        className="shrink-0"
      >
        <PhoneIncoming size={17} />
        <span className="hidden xl:inline">ПРИНЯТЬ ВЫЗОВ</span>
      </Button>

      {/* Тот же сценарий без голоса: для класса без гарнитур и для разбора
          сценария за столом. Оценка и карточка от этого не меняются. */}
      <IconButton
        variant="soft"
        color="gray"
        disabled={disabled || !chosen || blockedReason !== undefined}
        onClick={() => chosen && start("text")}
        aria-label="Начать разговор текстом"
        title={blockedReason ?? "Начать разговор текстом, без микрофона"}
        className="shrink-0"
      >
        <MessageSquareText size={17} />
      </IconButton>
    </div>
  );
}
