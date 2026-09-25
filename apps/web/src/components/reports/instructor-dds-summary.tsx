import { Badge, Card, Flex, Grid, Heading, Text } from "@bolid-ui/themes";

import type { InstructorReport } from "../../contracts/reports";
import type { DDS_PROCESS_ERROR_TYPES } from "../../contracts/dds-report";

type ProcessError = (typeof DDS_PROCESS_ERROR_TYPES)[number];
const DDS_PROCESS_ERROR_LABELS: Record<ProcessError, string> = {
  late_acknowledgement: "Карточка принята позже норматива",
  unexpected_refusal: "Необоснованный отказ",
  missed_refusal: "Пропущен ожидаемый отказ",
  unfinished: "Карточка не завершена",
};
const DDS_STATUS_LABELS: Record<string, string> = {
  completed: "Завершено",
  refused: "Отказ",
  lesson_finished: "Закрыто преподавателем",
};

const value = (number: number | null, suffix = "") =>
  number === null ? "—" : `${number}${suffix}`;

export function InstructorDdsSummary({
  dds,
}: {
  dds: InstructorReport["dds"];
}) {
  if (dds.cards === 0) {
    return (
      <Card size="2" variant="surface">
        <Heading size="3">Работа с карточками ДДС</Heading>
        <Text as="p" color="gray" size="2" mt="2">
          За выбранный период карточки ДДС не обрабатывались.
        </Text>
      </Card>
    );
  }

  const metrics = [
    ["Карточек", String(dds.cards)],
    ["Автоматический балл", value(dds.averageScore)],
    ["Итоговый балл", value(dds.finalScore)],
    ["В нормативе", value(dds.withinNormPercent, "%")],
    ["Полнота текста", value(dds.averageCoveragePercent, "%")],
  ];

  return (
    <Card size="2" variant="surface" className="grid gap-4">
      <Heading size="3">Работа с карточками ДДС</Heading>
      <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-5">
        {metrics.map(([label, metric]) => (
          <div key={label} className="min-w-0">
            <Text as="p" color="gray" size="1">
              {label}
            </Text>
            <Heading size="5">{metric}</Heading>
          </div>
        ))}
      </div>
      <div>
        <Text as="p" weight="bold" size="2">
          Исходы
        </Text>
        <Flex gap="2" wrap="wrap" mt="2">
          {dds.outcomes.map((item) => (
            <Badge key={item.status} variant="soft">
              {DDS_STATUS_LABELS[item.status] ?? item.status}: {item.count}
            </Badge>
          ))}
        </Flex>
      </div>
      <Grid columns={{ initial: "1", md: "2" }} gap="4">
        <div>
          <Text as="p" weight="bold" size="2">
            Частые ошибки
          </Text>
          {dds.topErrors.length === 0 ? (
            <Text color="gray" size="2">
              Ошибок не выявлено
            </Text>
          ) : (
            dds.topErrors.map((item) => (
              <Text as="p" size="2" key={item.type}>
                {DDS_PROCESS_ERROR_LABELS[item.type]} · {item.count}
              </Text>
            ))
          )}
        </div>
        <div>
          <Text as="p" weight="bold" size="2">
            Слабые места в тексте
          </Text>
          {dds.weakPoints.length === 0 ? (
            <Text color="gray" size="2">
              Недостающих пунктов нет
            </Text>
          ) : (
            dds.weakPoints.map((item) => (
              <Text as="p" size="2" key={item.label}>
                {item.label} · {item.count}
              </Text>
            ))
          )}
        </div>
      </Grid>
      {dds.scoreDynamics.length > 0 && (
        <div>
          <Text as="p" weight="bold" size="2">
            Динамика по занятиям
          </Text>
          <Flex gap="2" wrap="wrap" mt="2">
            {dds.scoreDynamics.map((item) => (
              <Badge key={item.lessonId} color="blue" variant="soft">
                {item.title}: {value(item.score)}
              </Badge>
            ))}
          </Flex>
        </div>
      )}
    </Card>
  );
}
