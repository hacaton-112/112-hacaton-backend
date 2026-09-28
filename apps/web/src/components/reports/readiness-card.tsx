import { Badge, Card, Flex, Heading, Text } from "@bolid-ui/themes";

import type { ReadinessPrediction } from "../../contracts/reports";

const labels = {
  ready: { text: "Готов к аттестации", color: "green" as const },
  needs_training: { text: "Требуется подготовка", color: "amber" as const },
  insufficient: { text: "Недостаточно данных", color: "gray" as const },
};

export function ReadinessBadge({
  prediction,
}: {
  prediction: ReadinessPrediction;
}) {
  const label = labels[prediction.label];
  return (
    <Badge color={label.color} variant="soft">
      {label.text} · {Math.round(prediction.probability * 100)}%
    </Badge>
  );
}

export function ReadinessCard({
  prediction,
}: {
  prediction: ReadinessPrediction;
}) {
  return (
    <Card size="2" variant="surface" className="grid shrink-0 gap-3">
      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <div>
          <Heading size="3">Готовность к аттестации</Heading>
          <Text as="p" size="1" color="gray" mt="1">
            Прозрачный прогноз по звонкам и карточкам ДДС
          </Text>
        </div>
        <ReadinessBadge prediction={prediction} />
      </Flex>
      <Flex gap="4" wrap="wrap">
        <Text size="2">Попыток: {prediction.features.attempts}</Text>
        <Text size="2">
          Средний балл: {prediction.features.averageScore ?? "—"}
        </Text>
        <Text size="2">
          Динамика: {prediction.features.trend > 0 ? "+" : ""}
          {prediction.features.trend}
        </Text>
        <Text size="2">
          Точность проверки:{" "}
          {prediction.quality.accuracy === null
            ? "недостаточно данных"
            : `${Math.round(prediction.quality.accuracy * 100)}%`}
        </Text>
      </Flex>
      <div>
        <Text as="p" size="2" weight="bold">
          Что мешает
        </Text>
        {/* Пустой список означает, что помех нет: общих советов вместо них не придумываем. */}
        {prediction.blockers.length === 0 ? (
          <Text as="p" size="2" color="gray" mt="1">
            Ничего не тянет результат вниз.
          </Text>
        ) : (
          <ul className="mt-1 list-disc pl-5 text-sm">
            {prediction.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
