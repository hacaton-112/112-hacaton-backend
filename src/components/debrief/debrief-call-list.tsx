import { Badge, Button, Card, Flex, ScrollArea, Text } from "@bolid-ui/themes";
import { useNavigate } from "react-router";

import type { CallSummary } from "../../contracts/debrief";
import { formatDuration } from "./debrief-formatters";
import { DebriefNotice } from "./debrief-primitives";
import { ROUTES } from "../../config/routes";

interface DebriefCallListProps {
  calls?: CallSummary[];
  isPending: boolean;
  error: Error | null;
}

export function DebriefCallList({
  calls,
  isPending,
  error,
}: DebriefCallListProps) {
  const navigate = useNavigate();

  if (error) {
    return (
      <DebriefNotice>
        Не удалось получить список вызовов: {error.message}
      </DebriefNotice>
    );
  }

  if (isPending) {
    return <DebriefNotice>Загружаю…</DebriefNotice>;
  }

  if (!calls || calls.length === 0) {
    return <DebriefNotice>Проведённых вызовов пока нет.</DebriefNotice>;
  }

  return (
    <ScrollArea className="h-full" scrollbars="vertical" type="auto">
      <div className="grid gap-2 p-4">
        {calls.map((call) => (
          <CallRow
            key={call.trainingSessionId}
            call={call}
            onOpen={() =>
              navigate(ROUTES.debriefSession(call.trainingSessionId))
            }
          />
        ))}
      </div>
    </ScrollArea>
  );
}

function CallRow({ call, onOpen }: { call: CallSummary; onOpen: () => void }) {
  return (
    <Card size="2" variant="classic">
      <Flex align="center" justify="between" gap="3">
        <div className="min-w-0">
          <Text size="2" weight="medium">
            {call.scenarioCode} · {call.title}
          </Text>
          <Text size="1" color="gray" as="p">
            {new Date(call.offeredAt).toLocaleString("ru-RU")} · разговор{" "}
            {formatDuration(call.durationSeconds)}
          </Text>
        </div>
        <Flex align="center" gap="2">
          <Badge
            color={call.stage === "ended" ? "gray" : "amber"}
            variant="soft"
          >
            {call.stage === "declined" ? "отклонён" : "завершён"}
          </Badge>
          <Button size="1" variant="soft" onClick={onOpen}>
            Разбор
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}
