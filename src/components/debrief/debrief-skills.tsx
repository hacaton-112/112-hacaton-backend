import { Card, Flex, Text } from "@bolid-ui/themes";

import type { DebriefEvaluation, DebriefSkill } from "../../contracts/debrief";

const toneOf = (percent: number) =>
  percent >= 80 ? "green" : percent >= 50 ? "orange" : "red";

const FILL_CLASS = {
  green: "bg-green-9",
  orange: "bg-orange-9",
  red: "bg-red-9",
} as const;

function SkillRow({ skill }: { skill: DebriefSkill }) {
  const tone = toneOf(skill.percent);

  return (
    <div>
      <Flex align="baseline" justify="between" gap="2">
        <Text size="1" color="gray">
          {skill.label}
        </Text>
        <Text size="2" weight="bold" color={tone}>
          {skill.percent}%
        </Text>
      </Flex>
      <div className="bg-grayA-4 mt-1 h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${FILL_CLASS[tone]}`}
          style={{ width: `${Math.min(100, Math.max(0, skill.percent))}%` }}
        />
      </div>
      <Text size="1" color="gray" as="div" className="mt-1">
        {skill.detail}
      </Text>
    </div>
  );
}

export function SkillsCard({ evaluation }: { evaluation: DebriefEvaluation }) {
  return (
    <Card size="3" variant="classic">
      <Text size="2" weight="bold">
        Оценка навыков
      </Text>
      <div className="mt-3 grid gap-3">
        {evaluation.skills.map((skill) => (
          <SkillRow key={skill.key} skill={skill} />
        ))}
      </div>
    </Card>
  );
}

/** Сравнение с другими операторами того же сценария. */
export function GroupCard({ evaluation }: { evaluation: DebriefEvaluation }) {
  const average = evaluation.groupAverageScore;

  return (
    <Card size="3" variant="classic">
      <Text size="2" weight="bold">
        Сравнение с группой
      </Text>
      {average === null ? (
        <Text size="2" color="gray" as="div" className="mt-3">
          Этот сценарий больше никто не проходил — сравнивать пока не с чем.
        </Text>
      ) : (
        <div className="mt-3 grid gap-3">
          <div>
            <Flex align="baseline" justify="between">
              <Text size="1" color="gray">
                Ваш результат
              </Text>
              <Text size="2" weight="bold" color="orange">
                {evaluation.score}%
              </Text>
            </Flex>
            <div className="bg-grayA-4 mt-1 h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-orange-9 h-full rounded-full"
                style={{ width: `${evaluation.score}%` }}
              />
            </div>
          </div>
          <div>
            <Flex align="baseline" justify="between">
              <Text size="1" color="gray">
                Среднее по группе
              </Text>
              <Text size="2" weight="bold">
                {average}%
              </Text>
            </Flex>
            <div className="bg-grayA-4 mt-1 h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-grayA-8 h-full rounded-full"
                style={{ width: `${average}%` }}
              />
            </div>
          </div>
          <Text size="1" color="gray">
            {evaluation.score === average
              ? `Ровно среднее по ${evaluation.groupCalls} другим вызовам.`
              : `Ваш результат ${evaluation.score > average ? "выше" : "ниже"} среднего по ${evaluation.groupCalls} другим вызовам на ${Math.abs(evaluation.score - average)}%.`}
          </Text>
        </div>
      )}
    </Card>
  );
}
