import { Badge, Card, Flex, Heading, Text } from "@bolid-ui/themes";

import type {
  DdsProcessErrorType,
  DdsReportCard,
} from "../../contracts/dds-report";

const ERROR_LABELS: Record<DdsProcessErrorType, string> = {
  late_acknowledgement: "Карточка принята позже норматива",
  unexpected_refusal: "Отказ по карточке, которую нужно было отработать",
  missed_refusal: "Карточка отработана, хотя ожидался отказ",
  unfinished: "Карточка не закрыта к концу занятия",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Добавлена",
  accepted: "Принята",
  not_accepted: "Не принята",
  responding: "Реагирование начато",
  arrived: "Прибытие",
  working: "Работы ведутся",
  completed: "Работы завершены",
  refused: "Отказ",
  lesson_finished: "Занятие завершено преподавателем",
};

const seconds = (value: number | null) =>
  value === null ? "—" : `${value} сек.`;

export function DdsReportCardDetails({ card }: { card: DdsReportCard }) {
  return (
    <div className="grid gap-4">
      <Card size="2" className="grid gap-3">
        <Flex justify="between" gap="3" wrap="wrap">
          <div>
            <Heading size="3">{card.scenarioTitle}</Heading>
            <Text size="1" color="gray">
              {card.scenarioCode}
            </Text>
          </div>
          <Badge color={card.finalScore === null ? "gray" : "green"}>
            {card.finalScore === null
              ? "Без оценки"
              : `${card.finalScore} баллов`}
          </Badge>
        </Flex>
        <div className="grid gap-2 sm:grid-cols-2">
          <Text size="2">
            Итоговый статус:{" "}
            {STATUS_LABELS[card.finalStatus] ?? card.finalStatus}
          </Text>
          <Text size="2">
            Исход по эталону:{" "}
            {card.outcomeMatched === null
              ? "не задан"
              : card.outcomeMatched
                ? "совпал"
                : "не совпал"}
          </Text>
          <Text size="2">
            Реакция: {seconds(card.timing.reactionSeconds)} / норматив{" "}
            {card.timing.reactionNormSeconds} сек.
          </Text>
          <Text size="2">
            Завершение: {seconds(card.timing.completionSeconds)} / норматив{" "}
            {card.timing.completionNormSeconds} сек.
          </Text>
          <Text size="2">Автооценка: {card.automaticScore ?? "—"}</Text>
          <Text size="2">
            Итог преподавателя: {card.instructorReview?.score ?? "—"}
          </Text>
        </div>
        {card.instructorReview?.comment && (
          <Text size="2">Комментарий: {card.instructorReview.comment}</Text>
        )}
      </Card>

      <Card size="2">
        <Heading size="3" mb="2">
          Хронология
        </Heading>
        <div className="grid gap-2">
          {card.timeline.map((event) => (
            <Flex key={event.sequence} justify="between" gap="3" wrap="wrap">
              <Text size="2">
                {event.sequence}. {STATUS_LABELS[event.status] ?? event.status}
                {event.comment ? ` — ${event.comment}` : ""}
              </Text>
              <Text size="1" color="gray">
                +{event.elapsedSeconds} сек.
              </Text>
            </Flex>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card size="2">
          <Heading size="3" mb="2">
            Полнота текста
          </Heading>
          <div className="grid gap-2">
            {card.coverage.length === 0 && (
              <Text color="gray">Оценка текста отсутствует</Text>
            )}
            {card.coverage.map((item) => (
              <div key={item.id}>
                <Badge color={item.status === "present" ? "green" : "red"}>
                  {item.status === "present" ? "Есть" : "Пропущено"}
                </Badge>{" "}
                <Text size="2">{item.label}</Text>
                {item.quote && (
                  <Text as="p" size="1" color="gray">
                    «{item.quote}»
                  </Text>
                )}
              </div>
            ))}
          </div>
        </Card>
        <Card size="2">
          <Heading size="3" mb="2">
            Ошибки и противоречия
          </Heading>
          {card.processErrors.length === 0 &&
          card.contradictions.length === 0 ? (
            <Text color="gray">Не выявлены</Text>
          ) : (
            <div className="grid gap-2">
              {card.processErrors.map((error) => (
                <Text key={error} size="2">
                  • {ERROR_LABELS[error]}
                </Text>
              ))}
              {card.contradictions.map((item, index) => (
                <Text key={`${item.description}-${index}`} size="2">
                  • {item.description}: «{item.quote}»
                </Text>
              ))}
            </div>
          )}
        </Card>
      </div>
      {card.grammar && (
        <Card size="2">
          <Heading size="3" mb="2">
            Грамотность
          </Heading>
          <Text size="2" color="gray">
            Ошибок: {card.grammar.errorCount}, замечаний по стилю:{" "}
            {card.grammar.styleCount}
          </Text>
          {card.grammar.fields.flatMap((field) =>
            field.issues.map((issue, index) => (
              <Text
                key={`${field.id}:${issue.kind}:${issue.offset}:${index}`}
                as="p"
                size="2"
                color={issue.severity === "error" ? "red" : "orange"}
              >
                {field.label}: {issue.message}
                {issue.suggestion ? ` — ${issue.suggestion}` : ""}
              </Text>
            )),
          )}
        </Card>
      )}
    </div>
  );
}
