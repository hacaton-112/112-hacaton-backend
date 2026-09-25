import { Badge, Box, Flex, Grid, Table, Text } from "@bolid-ui/themes";
import { Check, X } from "lucide-react";

import type { Debrief, DebriefEvaluation } from "../../contracts/debrief";
import { formatOffset, questionRows } from "./debrief-formatters";
import { DebriefSection } from "./debrief-primitives";

const REFERENCE_FIELD_LABELS: Record<string, string> = {
  city: "Город",
  street: "Улица",
  house: "Дом",
  entrance: "Подъезд",
  floor: "Этаж",
  apartment: "Квартира",
  object_type: "Тип объекта",
  landmarks: "Ориентиры",
  caller_name: "Имя заявителя",
  caller_phone: "Телефон",
  caller_type: "Кто звонит",
  dispatcher_notes: "Описание",
  category: "Категория",
  clarification: "Уточнение",
  started_at: "Время происшествия",
  victims_total: "Пострадавших",
  children_count: "Детей",
  victims_condition: "Состояние",
};

/** Детализация по вопросам: что получено против того, что ждал сценарий. */
export function QuestionsTable({ debrief }: { debrief: Debrief }) {
  const rows = questionRows(debrief);

  if (rows.length === 0) {
    return (
      <Text size="2" color="gray">
        Обязательных вопросов в сценарии нет.
      </Text>
    );
  }

  return (
    <Table.Root size="1" variant="ghost">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell width="40px">№</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell width="30%">Вопрос</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Получено</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Ожидалось</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell width="72px" justify="end">
            Статус
          </Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell width="72px" justify="end">
            Время
          </Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {rows.map((row, index) => (
          <Table.Row key={row.text} align="start">
            <Table.Cell>
              <Text size="2" color="gray">
                {index + 1}
              </Text>
            </Table.Cell>
            <Table.Cell>
              <Flex align="center" gap="2" wrap="wrap">
                <Text size="2">{row.text}</Text>
                {row.isCritical && (
                  <Badge color="red" variant="soft">
                    критично
                  </Badge>
                )}
              </Flex>
            </Table.Cell>
            <Table.Cell>
              <Text size="2" color={row.satisfied ? "green" : "red"}>
                {row.obtained.length === 0
                  ? "Не получено"
                  : row.obtained.join(", ")}
              </Text>
            </Table.Cell>
            <Table.Cell>
              <Text size="2" color="gray">
                {row.expected.join(", ")}
              </Text>
            </Table.Cell>
            <Table.Cell justify="end">
              {row.satisfied ? (
                <Check size={15} className="text-green-9" />
              ) : (
                <X size={15} className="text-red-9" />
              )}
            </Table.Cell>
            <Table.Cell justify="end">
              <Text size="2" color="gray" className="tabular-nums">
                {row.closedAtMs === null ? "—" : formatOffset(row.closedAtMs)}
              </Text>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

/** Карточка происшествия против эталонной анкеты, поле за полем. */
export function ReferenceSection({
  evaluation,
}: {
  evaluation: DebriefEvaluation;
}) {
  if (evaluation.fields.length === 0) {
    return null;
  }

  return (
    <DebriefSection title="Карточка против эталона">
      <Grid gap="2">
        {evaluation.fields.map((field) => (
          <Flex key={field.field} align="start" gap="2">
            <Box flexShrink="0" mt="1">
              {field.matched ? (
                <Check size={15} className="text-green-9" />
              ) : (
                <X size={15} className="text-red-9" />
              )}
            </Box>
            <Grid gap="1" flexGrow="1" className="min-w-0">
              <Text size="1" color="gray">
                {REFERENCE_FIELD_LABELS[field.field] ?? field.field}
                {field.isRequired ? "" : " · необязательное"}
              </Text>
              <Text size="2">{field.actual ?? "не заполнено"}</Text>
              {!field.matched && (
                <Text size="1" color="gray">
                  ожидалось: {field.expected}
                </Text>
              )}
            </Grid>
          </Flex>
        ))}
      </Grid>
    </DebriefSection>
  );
}

export function RecommendationsSection({
  evaluation,
}: {
  evaluation: DebriefEvaluation;
}) {
  if (evaluation.recommendations.length === 0) {
    return null;
  }

  return (
    <DebriefSection title="Рекомендации по улучшению">
      <Grid gap="2" asChild>
        <ul className="list-none">
          {evaluation.recommendations.map((line) => (
            <Flex key={line} align="start" gap="2" asChild>
              <li>
                <Text size="2" weight="bold" color="orange">
                  •
                </Text>
                <Text size="2" color="gray">
                  {line}
                </Text>
              </li>
            </Flex>
          ))}
        </ul>
      </Grid>
    </DebriefSection>
  );
}
