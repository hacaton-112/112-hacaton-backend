import { Button, Flex, Text } from "@bolid-ui/themes";
import { FilePlus2 } from "lucide-react";
import { useNavigate } from "react-router";

import type { CallState } from "../../hooks/use-call";
import { useAuthStore } from "../../stores/auth.store";

interface OperatorHeaderProps {
  state: CallState;
  scenarioTitle?: string;
  scenarioDifficulty?: number;
  operatorName: string;
}

const CALL_STATE_LABELS: Record<CallState, string> = {
  idle: "Ожидание учебного вызова",
  ringing: "Входящий учебный вызов",
  active: "Учебный вызов принят",
  ended: "Учебный вызов завершён",
};

const getInitials = (fullName: string) =>
  fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "ОП";

export function OperatorHeader({
  state,
  scenarioTitle,
  scenarioDifficulty,
  operatorName,
}: OperatorHeaderProps) {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.user?.role);
  const canAuthorScenarios = role === "instructor" || role === "admin";

  return (
    <header className="border-grayA-4 bg-panel flex h-[38px] shrink-0 items-center border-b px-4">
      <Flex align="center" gap="3" className="min-w-0 flex-1">
        <Text size="2" weight="bold" className="shrink-0">
          АРМ диспетчера
        </Text>
        <span className="bg-grayA-5 hidden h-5 w-px sm:block" />
        <Text
          size="1"
          color="gray"
          className="hidden min-w-0 truncate sm:block"
        >
          {scenarioTitle ?? CALL_STATE_LABELS[state]}
          {scenarioDifficulty ? ` · сложность ${scenarioDifficulty}/5` : ""}
        </Text>
      </Flex>

      <Text size="1" weight="medium" className="hidden shrink-0 px-4 lg:block">
        Тренажёр
      </Text>

      <Flex align="center" gap="2" className="min-w-0 justify-end">
        {canAuthorScenarios && (
          <Button
            type="button"
            size="1"
            variant="ghost"
            onClick={() => navigate("/scenarios/new")}
          >
            <FilePlus2 size={14} />
            <span className="hidden xl:inline">Конструктор</span>
          </Button>
        )}
        <Text size="1" color="gray" className="hidden truncate md:block">
          Стажёр: {operatorName}
        </Text>
        <span className="bg-blue-9 grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold text-white">
          {getInitials(operatorName)}
        </span>
      </Flex>
    </header>
  );
}
