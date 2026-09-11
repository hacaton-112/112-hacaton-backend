import { Badge, Card, Flex, Text } from "@bolid-ui/themes";
import { Check, X } from "lucide-react";

import type { Debrief, DebriefEvaluation } from "../../contracts/debrief";
import { formatOffset, questionRows } from "./debrief-formatters";

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
export function QuestionsCard({ debrief }: { debrief: Debrief }) {
  const rows = questionRows(debrief);

  return (
    <Card size="3" variant="classic">
      <Text size="2" weight="bold">
        Детализация по вопросам
      </Text>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-grayA-5 border-b">
              {["№", "Вопрос", "Получено", "Ожидалось", "Статус", "Время"].map(
                (title, index) => (
                  <th key={title} className="py-2 pr-3 font-normal">
                    <Text
                      size="1"
                      color="gray"
                      align={index >= 4 ? "right" : "left"}
                      as="div"
                    >
                      {title}
                    </Text>
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.text} className="border-grayA-3 border-b">
                <td className="py-2 pr-3 align-top">
                  <Text size="2" color="gray">
                    {index + 1}
                  </Text>
                </td>
                <td className="w-[38%] py-2 pr-3 align-top">
                  <Text size="2">{row.text}</Text>
                  {row.isCritical && (
                    <Badge color="red" variant="soft" radius="full" ml="2">
                      критично
                    </Badge>
                  )}
                </td>
                <td className="py-2 pr-3 align-top">
                  <Text size="2" color={row.satisfied ? "green" : "red"}>
                    {row.obtained.length === 0
                      ? "Не получено"
                      : row.obtained.join(", ")}
                  </Text>
                </td>
                <td className="py-2 pr-3 align-top">
                  <Text size="2" color="gray">
                    {row.expected.join(", ")}
                  </Text>
                </td>
                <td className="py-2 pr-3 text-right align-top">
                  {row.satisfied ? (
                    <Check size={15} className="text-green-9 inline" />
                  ) : (
                    <X size={15} className="text-red-9 inline" />
                  )}
                </td>
                <td className="py-2 text-right align-top">
                  <Text size="2" color="gray">
                    {row.closedAtMs === null
                      ? "—"
                      : formatOffset(row.closedAtMs)}
                  </Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Карточка происшествия против эталонной анкеты, поле за полем. */
export function ReferenceCard({
  evaluation,
}: {
  evaluation: DebriefEvaluation;
}) {
  if (evaluation.fields.length === 0) {
    return null;
  }

  return (
    <Card size="3" variant="classic">
      <Text size="2" weight="bold">
        Карточка против эталона
      </Text>
      <div className="mt-3 grid gap-2">
        {evaluation.fields.map((field) => (
          <Flex key={field.field} align="start" gap="2">
            {field.matched ? (
              <Check size={15} className="text-green-9 mt-0.5 shrink-0" />
            ) : (
              <X size={15} className="text-red-9 mt-0.5 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <Text size="1" color="gray" as="div">
                {REFERENCE_FIELD_LABELS[field.field] ?? field.field}
                {field.isRequired ? "" : " · необязательное"}
              </Text>
              <Text size="2" as="div">
                {field.actual ?? "не заполнено"}
              </Text>
              {!field.matched && (
                <Text size="1" color="gray" as="div">
                  ожидалось: {field.expected}
                </Text>
              )}
            </div>
          </Flex>
        ))}
      </div>
    </Card>
  );
}

export function RecommendationsCard({
  evaluation,
}: {
  evaluation: DebriefEvaluation;
}) {
  return (
    <Card size="3" variant="classic">
      <Text size="2" weight="bold">
        Рекомендации по улучшению
      </Text>
      <div className="mt-3 grid gap-2">
        {evaluation.recommendations.map((line) => (
          <Flex key={line} align="start" gap="2">
            <Text size="2" weight="bold" color="orange">
              •
            </Text>
            <Text size="2" color="gray">
              {line}
            </Text>
          </Flex>
        ))}
      </div>
    </Card>
  );
}
