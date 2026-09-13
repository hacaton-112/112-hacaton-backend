import { Flex, Grid, Progress, Text } from "@bolid-ui/themes";

import type { DebriefEvaluation, DebriefSkill } from "../../contracts/debrief";
import { DebriefSection } from "./debrief-primitives";

const toneOf = (percent: number) =>
  percent >= 80 ? "green" : percent >= 50 ? "orange" : "red";

const clamp = (percent: number) => Math.min(100, Math.max(0, percent));

function SkillRow({ skill }: { skill: DebriefSkill }) {
  const tone = toneOf(skill.percent);

  return (
    <Grid gap="1">
      <Flex align="baseline" justify="between" gap="2">
        <Text size="2" color="gray">
          {skill.label}
        </Text>
        <Text size="3" weight="bold" color={tone}>
          {skill.percent}%
        </Text>
      </Flex>
      <Progress
        value={clamp(skill.percent)}
        color={tone}
        size="1"
        variant="soft"
      />
      <Text size="1" color="gray">
        {skill.detail}
      </Text>
    </Grid>
  );
}

export function SkillsSection({
  evaluation,
}: {
  evaluation: DebriefEvaluation;
}) {
  return (
    <DebriefSection title="Оценка навыков">
      <Grid gap="4">
        {evaluation.skills.map((skill) => (
          <SkillRow key={skill.key} skill={skill} />
        ))}
      </Grid>
    </DebriefSection>
  );
}

/** Сравнение с другими операторами того же сценария. */
export function GroupSection({
  evaluation,
  operatorName,
}: {
  evaluation: DebriefEvaluation;
  operatorName?: string;
}) {
  const average = evaluation.groupAverageScore;

  if (average === null) {
    return (
      <DebriefSection title="Сравнение с группой">
        <Text size="2" color="gray">
          Этот сценарий больше никто не проходил — сравнивать пока не с чем.
        </Text>
      </DebriefSection>
    );
  }

  return (
    <DebriefSection title="Сравнение с группой">
      <Grid gap="3">
        <Grid gap="1">
          <Flex align="center" justify="between" gap="2">
            <Text size="2" color="gray">
              {operatorName === undefined
                ? "Ваш результат"
                : `Вы (${operatorName})`}
            </Text>
            <Text size="3" weight="bold" color="orange">
              {evaluation.score}%
            </Text>
          </Flex>
          <Progress
            value={clamp(evaluation.score)}
            color="orange"
            size="2"
            variant="soft"
          />
        </Grid>
        <Grid gap="1">
          <Flex align="center" justify="between" gap="2">
            <Text size="2" color="gray">
              Среднее по группе
            </Text>
            <Text size="3" weight="bold">
              {average}%
            </Text>
          </Flex>
          <Progress
            value={clamp(average)}
            color="gray"
            size="2"
            variant="soft"
            highContrast
          />
        </Grid>
        <Text size="2" color="gray">
          {evaluation.score === average
            ? `Ровно среднее по ${evaluation.groupCalls} другим вызовам.`
            : `Ваш результат ${evaluation.score > average ? "выше" : "ниже"} среднего по ${evaluation.groupCalls} другим вызовам на ${Math.abs(evaluation.score - average)}%.`}
        </Text>
      </Grid>
    </DebriefSection>
  );
}
