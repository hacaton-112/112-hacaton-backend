import type { EmergencyService, ReferenceComparison } from "@/drizzle/schema";

/**
 * Оценка учебного звонка.
 *
 * Считается детерминированно и только по тому, что записано в сценарии:
 * обязательные вопросы, эталонная анкета с правилами сравнения, ожидаемые
 * службы и норматив приёма. Модель здесь не участвует намеренно — оценку
 * показывают человеку, которого оценили, и она должна быть одинаковой при
 * каждом открытии разбора и объяснимой построчно.
 */
export const SKILL_WEIGHTS = {
  questioning: 0.35,
  card: 0.35,
  services: 0.15,
  regulations: 0.15,
} as const;

export type SkillKey = keyof typeof SKILL_WEIGHTS;

export const SKILL_LABELS: Record<SkillKey, string> = {
  questioning: "Полнота опроса",
  card: "Точность карточки",
  services: "Взаимодействие со службами",
  regulations: "Работа по регламенту",
};

/** Критический вопрос весит вдвое: без него вызов не обслужить. */
const CRITICAL_WEIGHT = 2;
const NORMAL_WEIGHT = 1;

export interface EvaluationQuestion {
  readonly text: string;
  readonly isCritical: boolean;
  readonly satisfied: boolean;
  /** Ключи сведений, которые оператор действительно получил. */
  readonly obtainedFactKeys: readonly string[];
  readonly expectedFactKeys: readonly string[];
}

export interface ReferenceField {
  readonly field: string;
  readonly expectedValue: string;
  readonly acceptableValues: readonly string[];
  readonly comparison: ReferenceComparison;
  readonly isRequired: boolean;
}

export interface EvaluationInput {
  readonly questions: readonly EvaluationQuestion[];
  readonly reference: readonly ReferenceField[];
  /** Что оператор написал в соответствующем поле карточки; `null` — не заполнил. */
  readonly cardValues: Readonly<Record<string, string | null>>;
  readonly expectedServices: readonly EmergencyService[];
  readonly dispatchedServices: readonly EmergencyService[];
  readonly answerSeconds: number | null;
  readonly answerNormSeconds: number;
  readonly forbiddenPhrases: number;
  readonly passThreshold: number;
}

export interface SkillScore {
  readonly key: SkillKey;
  readonly label: string;
  readonly percent: number;
  /** Из чего сложился процент: показывается под полосой на разборе. */
  readonly detail: string;
}

export interface FieldComparison {
  readonly field: string;
  readonly expected: string;
  readonly actual: string | null;
  readonly matched: boolean;
  readonly isRequired: boolean;
}

export interface Evaluation {
  readonly score: number;
  readonly verdict: "excellent" | "passed" | "failed";
  readonly passThreshold: number;
  readonly skills: readonly SkillScore[];
  readonly fields: readonly FieldComparison[];
  readonly recommendations: readonly string[];
}

const EXCELLENT_SCORE = 90;
const MAX_RECOMMENDATIONS = 4;

const percent = (part: number, whole: number): number =>
  whole === 0 ? 100 : Math.round((part / whole) * 100);

export const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

const digits = (value: string): number | null => {
  const found = /-?\d+(?:[.,]\d+)?/u.exec(value.replace(",", "."));

  return found === null ? null : Number(found[0]);
};

/**
 * Совпало ли то, что написал оператор, с эталоном.
 *
 * Правило сравнения задаёт автор сценария: где-то важна точная строка, где-то
 * достаточно упоминания. Адрес оператор пишет одной строкой, поэтому улица и
 * дом ищутся вхождением — разбирать строку на части значило бы придумывать за
 * него разметку, которой в окне нет.
 */
export const matchesReference = (
  actual: string | null,
  field: ReferenceField,
): boolean => {
  if (actual === null || actual.trim().length === 0) {
    return false;
  }

  const candidates = [field.expectedValue, ...field.acceptableValues];

  switch (field.comparison) {
    case "exact":
      return candidates.some((candidate) => candidate === actual.trim());
    case "normalized":
      return candidates.some(
        (candidate) => normalize(candidate) === normalize(actual),
      );
    case "numeric_range": {
      const actualNumber = digits(actual);

      return (
        actualNumber !== null &&
        candidates.some((candidate) => digits(candidate) === actualNumber)
      );
    }
    case "contains":
      return candidates.some((candidate) =>
        normalize(actual).includes(normalize(candidate)),
      );
  }
};

const questioningSkill = (
  questions: readonly EvaluationQuestion[],
): SkillScore => {
  const weight = (question: EvaluationQuestion) =>
    question.isCritical ? CRITICAL_WEIGHT : NORMAL_WEIGHT;
  const total = questions.reduce((sum, question) => sum + weight(question), 0);
  const closed = questions
    .filter((question) => question.satisfied)
    .reduce((sum, question) => sum + weight(question), 0);
  const satisfied = questions.filter((question) => question.satisfied).length;

  return {
    key: "questioning",
    label: SKILL_LABELS.questioning,
    percent: percent(closed, total),
    detail: `${satisfied} из ${questions.length} обязательных вопросов`,
  };
};

const cardSkill = (
  fields: readonly FieldComparison[],
): SkillScore => {
  const required = fields.filter((field) => field.isRequired);
  const matched = required.filter((field) => field.matched).length;

  return {
    key: "card",
    label: SKILL_LABELS.card,
    percent: percent(matched, required.length),
    detail: `${matched} из ${required.length} полей совпали с эталоном`,
  };
};

const servicesSkill = (
  expected: readonly EmergencyService[],
  dispatched: readonly EmergencyService[],
): SkillScore => {
  const wanted = new Set(expected);
  const sent = new Set(dispatched);
  const matched = [...wanted].filter((service) => sent.has(service)).length;
  // Лишняя служба — тоже ошибка: наряд уходит туда, где он не нужен.
  const extra = [...sent].filter((service) => !wanted.has(service)).length;
  const value = Math.max(
    0,
    percent(matched, wanted.size) - extra * (wanted.size === 0 ? 0 : 25),
  );

  return {
    key: "services",
    label: SKILL_LABELS.services,
    percent: value,
    detail:
      extra === 0
        ? `${matched} из ${wanted.size} нужных служб`
        : `${matched} из ${wanted.size} нужных служб, лишних ${extra}`,
  };
};

const regulationsSkill = (input: EvaluationInput): SkillScore => {
  const inTime =
    input.answerSeconds !== null &&
    input.answerSeconds <= input.answerNormSeconds;
  const checks = [inTime, input.forbiddenPhrases === 0];
  const passed = checks.filter(Boolean).length;
  const notes = [
    inTime ? "вызов принят в норматив" : "норматив приёма превышен",
    input.forbiddenPhrases === 0
      ? "запрещённых фраз не было"
      : `запрещённых фраз: ${input.forbiddenPhrases}`,
  ];

  return {
    key: "regulations",
    label: SKILL_LABELS.regulations,
    percent: percent(passed, checks.length),
    detail: notes.join(", "),
  };
};

const buildRecommendations = (
  input: EvaluationInput,
  fields: readonly FieldComparison[],
): readonly string[] => {
  const lines: string[] = [];

  // Сначала критические вопросы: без них вызов не обслужить, и повторять их
  // важнее, чем поправлять формулировку в карточке.
  for (const question of input.questions) {
    if (!question.satisfied && question.isCritical) {
      lines.push(`Обязательный вопрос остался незакрытым: ${question.text}.`);
    }
  }

  const missedServices = input.expectedServices.filter(
    (service) => !input.dispatchedServices.includes(service),
  );

  if (missedServices.length > 0) {
    lines.push(
      `Не назначены службы, которых требует происшествие: ${missedServices.join(", ")}.`,
    );
  }

  const wrongFields = fields.filter(
    (field) => field.isRequired && !field.matched,
  );

  if (wrongFields.length > 0) {
    lines.push(
      `Карточка расходится с эталоном по полям: ${wrongFields
        .map((field) => field.field)
        .join(", ")}.`,
    );
  }

  if (
    input.answerSeconds !== null &&
    input.answerSeconds > input.answerNormSeconds
  ) {
    lines.push(
      `Вызов принят за ${input.answerSeconds} с при нормативе ${input.answerNormSeconds} с.`,
    );
  }

  if (input.forbiddenPhrases > 0) {
    lines.push(
      "В разговоре прозвучали фразы, которые заявителя только раскручивают: они подняли его состояние по шкале.",
    );
  }

  if (lines.length === 0) {
    lines.push("Разбор не нашёл, к чему придраться: вызов обслужен по регламенту.");
  }

  return lines.slice(0, MAX_RECOMMENDATIONS);
};

export const evaluateCall = (input: EvaluationInput): Evaluation => {
  const fields = input.reference.map((field): FieldComparison => {
    const actual = input.cardValues[field.field] ?? null;

    return {
      field: field.field,
      expected: field.expectedValue,
      actual,
      matched: matchesReference(actual, field),
      isRequired: field.isRequired,
    };
  });
  const skills = [
    questioningSkill(input.questions),
    cardSkill(fields),
    servicesSkill(input.expectedServices, input.dispatchedServices),
    regulationsSkill(input),
  ];
  const score = Math.round(
    skills.reduce(
      (sum, skill) => sum + skill.percent * SKILL_WEIGHTS[skill.key],
      0,
    ),
  );

  return {
    score,
    verdict:
      score >= EXCELLENT_SCORE
        ? "excellent"
        : score >= input.passThreshold
          ? "passed"
          : "failed",
    passThreshold: input.passThreshold,
    skills,
    fields,
    recommendations: buildRecommendations(input, fields),
  };
};
