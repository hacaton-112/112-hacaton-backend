import { Badge, Callout, Card, Flex, Heading, Skeleton, Text } from "@bolid-ui/themes";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock3 } from "lucide-react";
import { useEffect, useState } from "react";

import { QUERY_KEYS } from "../../config/query-keys";
import {
  DDS_LIVE_FINDING_LABELS,
  type DdsLiveAttempt,
} from "../../contracts/dds-training";
import { ddsTrainingService } from "../../services/dds-training.service";
import {
  acknowledgementSecondsLeft,
  DDS_SERVICE_LABELS,
  DDS_STATUS_LABELS,
  formatCountdown,
} from "./dds-formatters";

/**
 * Карточки ДДС, с которыми ученики работают прямо сейчас.
 *
 * Преподаватель сидит на одном месте и не обходит класс, поэтому здесь видно
 * остаток норматива и то, что уже пошло не так. Это наблюдение, а не оценка:
 * балл появляется после завершения попытки.
 */
export function DdsLiveAttempts() {
  const attempts = useQuery({
    queryKey: QUERY_KEYS.ddsLiveAttempts(),
    queryFn: ({ signal }) => ddsTrainingService.live(signal),
    refetchInterval: 2_000,
    retry: false,
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="flex flex-col gap-3" aria-label="Карточки ДДС в работе">
      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <Heading size="4">Карточки ДДС</Heading>
        {attempts.isFetching && !attempts.isPending && (
          <Text size="1" color="gray">
            Обновление…
          </Text>
        )}
      </Flex>

      {attempts.error && (
        <Callout.Root color="red" role="alert">
          <Callout.Icon>
            <AlertTriangle size={16} />
          </Callout.Icon>
          <Callout.Text>
            Не удалось получить карточки в работе: {attempts.error.message}
          </Callout.Text>
        </Callout.Root>
      )}

      {attempts.isPending ? (
        <Skeleton height="96px" className="rounded-(--radius-4)" />
      ) : attempts.data?.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {attempts.data.map((attempt) => (
            <LiveAttemptCard
              key={attempt.exerciseId}
              attempt={attempt}
              now={now}
            />
          ))}
        </div>
      ) : (
        <Text size="2" color="gray">
          Сейчас никто не работает с карточкой ДДС.
        </Text>
      )}
    </section>
  );
}

function LiveAttemptCard({
  attempt,
  now,
}: {
  attempt: DdsLiveAttempt;
  now: number;
}) {
  const waiting = attempt.acknowledgedAt === null;
  const left = acknowledgementSecondsLeft(
    attempt.acknowledgementDeadlineAt,
    now,
  );

  return (
    <Card size="2" variant="surface">
      <Flex align="start" justify="between" gap="3" wrap="wrap">
        <div>
          <Text weight="medium">{attempt.operatorName}</Text>
          <Text as="p" size="1" color="gray">
            {attempt.assignmentTitle} · попытка {attempt.attemptNumber}
          </Text>
        </div>
        <Flex align="center" gap="2" wrap="wrap">
          <Badge color="gray" variant="soft">
            {DDS_SERVICE_LABELS[attempt.addressedService]}
          </Badge>
          <Badge variant="soft">{DDS_STATUS_LABELS[attempt.status]}</Badge>
          {waiting && (
            <Badge color={left === 0 ? "red" : "green"}>
              <Clock3 size={12} /> {formatCountdown(left)}
            </Badge>
          )}
        </Flex>
      </Flex>

      <Text as="p" size="2" mt="2">
        {attempt.cardTitle}
      </Text>

      {attempt.findings.length > 0 && (
        <Flex gap="2" wrap="wrap" mt="2">
          {attempt.findings.map((finding) => (
            <Badge key={finding} color="orange" variant="soft">
              {DDS_LIVE_FINDING_LABELS[finding]}
            </Badge>
          ))}
        </Flex>
      )}
    </Card>
  );
}
