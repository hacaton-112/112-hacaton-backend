import { Box, Flex, Grid, Text } from "@bolid-ui/themes";

import type { Debrief, DebriefEvaluation } from "../../contracts/debrief";
import { answerStats, formatDuration } from "./debrief-formatters";
import { DebriefSection } from "./debrief-primitives";

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

const RING_STROKE_CLASS = {
  green: "stroke-green-9",
  orange: "stroke-orange-9",
  red: "stroke-red-9",
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

export function ScoreSection({
  evaluation,
}: {
  evaluation: DebriefEvaluation;
}) {
  const color = VERDICT_COLOR[evaluation.verdict];

  return (
    <DebriefSection title="Общий результат">
      <Flex direction="column" align="center" gap="5">
        <Box position="relative" height={`${RING_SIZE}px`}>
          <ScoreRing
            percent={evaluation.score}
            tone={RING_STROKE_CLASS[color]}
          />
          <Flex
            direction="column"
            align="center"
            justify="center"
            position="absolute"
            inset="0"
          >
            <Text size="8" weight="bold">
              {evaluation.score}%
            </Text>
            <Text size="2" color="gray">
              {evaluation.score} / 100
            </Text>
          </Flex>
        </Box>
        <Flex direction="column" align="center" gap="1">
          <Text size="5" weight="bold" color={color}>
            {VERDICT_LABEL[evaluation.verdict]}
          </Text>
          <Text size="2" color="gray" align="center">
            {evaluation.verdict === "failed"
              ? `Порог прохождения ${evaluation.passThreshold}% не набран.`
              : `Минимальный порог прохождения для дежурства (${evaluation.passThreshold}%) успешно преодолён.`}
          </Text>
        </Flex>
      </Flex>
    </DebriefSection>
  );
}

export function TimeSection({ debrief }: { debrief: Debrief }) {
  const {
    durationSeconds,
    expectedDurationSeconds,
    answerSeconds,
    answerNormSeconds,
  } = debrief.timings;
  const operatorTurns = debrief.timeline.filter(
    (entry) => entry.type === "operator.utterance",
  ).length;
  const perReply =
    durationSeconds === null || operatorTurns === 0
      ? null
      : Math.round(durationSeconds / operatorTurns);
  const late = answerSeconds !== null && answerSeconds > answerNormSeconds;

  return (
    <DebriefSection title="Время прохождения">
      <Flex align="baseline" justify="between" gap="3" mb="4">
        <Text size="8" weight="bold">
          {formatDuration(durationSeconds)}
        </Text>
        <Text size="2" color="gray">
          ориентир: {formatDuration(expectedDurationSeconds)}
        </Text>
      </Flex>
      <Grid gap="2">
        <Flex align="baseline" justify="between" gap="3">
          <Text size="2" color="gray">
            Ср. время на реплику:
          </Text>
          <Text size="3" weight="bold">
            {perReply === null ? "—" : formatDuration(perReply)}
          </Text>
        </Flex>
        <Flex align="baseline" justify="between" gap="3">
          <Text size="2" color="gray">
            Ответ на вызов:
          </Text>
          <Text size="3" weight="bold" color={late ? "red" : undefined}>
            {answerSeconds === null ? "—" : `${answerSeconds} с`} при норме{" "}
            {answerNormSeconds} с
          </Text>
        </Flex>
      </Grid>
    </DebriefSection>
  );
}

export function AnswerStatsSection({ debrief }: { debrief: Debrief }) {
  const stats = answerStats(debrief);

  return (
    <DebriefSection title="Статистика ответов">
      <Grid gap="2">
        <StatsRow label="Правильные" value={stats.satisfied} color="green" />
        <StatsRow label="С ошибками" value={stats.partial} color="red" />
        <StatsRow label="Пропущенные" value={stats.missed} color="gray" />
      </Grid>
    </DebriefSection>
  );
}

function StatsRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "green" | "red" | "gray";
}) {
  return (
    <Flex align="center" justify="between" gap="3">
      <Text size="3" color="gray">
        {label}
      </Text>
      <Text size="3" weight="bold" color={color}>
        {value}
      </Text>
    </Flex>
  );
}
