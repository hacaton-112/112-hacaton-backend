import { Card, Flex, Separator, Text } from "@bolid-ui/themes";

import type { Debrief, DebriefEvaluation } from "../../contracts/debrief";
import { answerStats, formatDuration } from "./debrief-formatters";

const RING_SIZE = 140;
const RING_STROKE = 12;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const VERDICT_COLOR = {
  excellent: "green",
  passed: "orange",
  failed: "red",
} as const;

const VERDICT_LABEL = {
  excellent: "Отлично",
  passed: "Хорошо",
  failed: "Не пройдено",
} as const;

/**
 * Кольцо рисуется из настоящего числа, а не берётся картинкой из макета:
 * в экспорте оно нарисовано под 78% и другому результату соврёт.
 */
function ScoreRing({ percent, tone }: { percent: number; tone: string }) {
  const filled = Math.min(100, Math.max(0, percent));

  return (
    <svg
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      role="presentation"
    >
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill="none"
        strokeWidth={RING_STROKE}
        className="stroke-grayA-4"
      />
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill="none"
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={RING_LENGTH}
        strokeDashoffset={RING_LENGTH * (1 - filled / 100)}
        transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        className={tone}
      />
    </svg>
  );
}

export function ScoreCard({ evaluation }: { evaluation: DebriefEvaluation }) {
  const color = VERDICT_COLOR[evaluation.verdict];

  return (
    <Card size="3" variant="classic">
      <Text size="2" weight="bold">
        Общий результат
      </Text>
      <Flex direction="column" align="center" gap="3" className="mt-4">
        <div className="relative" style={{ height: RING_SIZE }}>
          <ScoreRing
            percent={evaluation.score}
            tone={
              color === "green"
                ? "stroke-green-9"
                : color === "orange"
                  ? "stroke-orange-9"
                  : "stroke-red-9"
            }
          />
          <Flex
            direction="column"
            align="center"
            className="absolute inset-0 justify-center"
          >
            <Text size="7" weight="bold">
              {evaluation.score}%
            </Text>
            <Text size="1" color="gray">
              {evaluation.score} / 100
            </Text>
          </Flex>
        </div>
        <Text size="4" weight="bold" color={color}>
          {VERDICT_LABEL[evaluation.verdict]}
        </Text>
        <Text size="1" color="gray" align="center">
          {evaluation.verdict === "failed"
            ? `Порог прохождения ${evaluation.passThreshold}% не набран.`
            : `Минимальный порог прохождения (${evaluation.passThreshold}%) преодолён.`}
        </Text>
      </Flex>
    </Card>
  );
}

export function TimeCard({ debrief }: { debrief: Debrief }) {
  const {
    durationSeconds,
    expectedDurationSeconds,
    answerSeconds,
    answerNormSeconds,
  } = debrief.timings;
  const operatorTurns = debrief.timeline.filter(
    (entry) => entry.type === "operator.utterance",
  ).length;
  const perQuestion =
    durationSeconds === null || operatorTurns === 0
      ? null
      : Math.round(durationSeconds / operatorTurns);
  const late = answerSeconds !== null && answerSeconds > answerNormSeconds;

  return (
    <Card size="3" variant="classic">
      <Text size="2" weight="bold">
        Время прохождения
      </Text>
      <Flex align="baseline" justify="between" className="mt-3">
        <Text size="8" weight="bold">
          {formatDuration(durationSeconds)}
        </Text>
        <Text size="1" color="gray">
          ориентир: {formatDuration(expectedDurationSeconds)}
        </Text>
      </Flex>
      <Separator size="4" className="my-3" />
      <Flex justify="between" className="mb-2">
        <Text size="1" color="gray">
          Ответ на вызов
        </Text>
        <Text size="2" weight="bold" color={late ? "red" : undefined}>
          {answerSeconds === null ? "—" : `${answerSeconds} с`} при нормативе{" "}
          {answerNormSeconds} с
        </Text>
      </Flex>
      <Flex justify="between">
        <Text size="1" color="gray">
          Ср. время на реплику
        </Text>
        <Text size="2" weight="bold">
          {perQuestion === null ? "—" : formatDuration(perQuestion)}
        </Text>
      </Flex>
    </Card>
  );
}

export function AnswerStatsCard({ debrief }: { debrief: Debrief }) {
  const stats = answerStats(debrief);

  return (
    <Card size="3" variant="classic">
      <Text size="2" weight="bold">
        Статистика ответов
      </Text>
      <div className="mt-3 grid gap-2">
        <Flex justify="between">
          <Text size="2" color="gray">
            Закрытые вопросы
          </Text>
          <Text size="2" weight="bold" color="green">
            {stats.satisfied}
          </Text>
        </Flex>
        <Flex justify="between">
          <Text size="2" color="gray">
            Закрытые наполовину
          </Text>
          <Text size="2" weight="bold" color="orange">
            {stats.partial}
          </Text>
        </Flex>
        <Flex justify="between">
          <Text size="2" color="gray">
            Пропущенные
          </Text>
          <Text size="2" weight="bold" color="red">
            {stats.missed}
          </Text>
        </Flex>
      </div>
    </Card>
  );
}
