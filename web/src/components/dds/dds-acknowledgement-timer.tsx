import { Badge, Flex, Text } from "@bolid-ui/themes";
import { Clock3 } from "lucide-react";
import { useEffect, useState } from "react";

import type { DdsExercise } from "../../contracts/dds-exercise";
import { acknowledgementSecondsLeft, formatCountdown } from "./dds-formatters";

export function DdsAcknowledgementTimer({
  exercise,
}: {
  exercise: DdsExercise;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (exercise.acknowledgedAt || exercise.completedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [exercise.acknowledgedAt, exercise.completedAt]);

  if (exercise.completedAt && !exercise.acknowledgedAt) return <Badge color="gray">Попытка закрыта без первичного статуса</Badge>;

  if (exercise.acknowledgedAt) {
    const met =
      Date.parse(exercise.acknowledgedAt) <=
      Date.parse(exercise.acknowledgementDeadlineAt);

    return (
      <Badge
        className="arm-dds-ack-badge"
        color={met ? "green" : "red"}
        size="2"
        variant="soft"
      >
        <Clock3 size={15} />
        {met ? "Подтверждено вовремя" : "Норматив нарушен"}
      </Badge>
    );
  }

  const seconds = acknowledgementSecondsLeft(
    exercise.acknowledgementDeadlineAt,
    now,
  );

  return (
    <Flex className="arm-dds-ack-timer" align="center" gap="2">
      <Badge
        className="arm-dds-ack-badge"
        color={seconds > 0 ? "amber" : "red"}
        size="2"
        variant="soft"
      >
        <Clock3 size={15} />
        {formatCountdown(seconds)}
      </Badge>
      <Text size="1" color={seconds > 0 ? "gray" : "red"}>
        {seconds > 0 ? "до первичного статуса" : "первичный статус просрочен"}
      </Text>
    </Flex>
  );
}
