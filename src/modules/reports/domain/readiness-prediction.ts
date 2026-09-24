export interface ReadinessObservation {
  occurredAt: string;
  score: number | null;
  passed: boolean | null;
  withinNorm: boolean | null;
  hasProcessErrors: boolean;
  textCoverage: number | null;
}

export interface ReadinessFeatures {
  averageScore: number | null;
  latestScore: number | null;
  trend: number;
  passRate: number | null;
  withinNormRate: number | null;
  processErrorFrequency: number;
  textCoverage: number | null;
  attempts: number;
}

const MIN_OBSERVATIONS = 5;
const QUALITY_MIN_OBSERVATIONS = 8;
const READY_THRESHOLD = 0.7;

const mean = (values: readonly number[]) =>
  values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function extractReadinessFeatures(
  observations: readonly ReadinessObservation[],
): ReadinessFeatures {
  const ordered = [...observations].sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt),
  );
  const scores = ordered.flatMap(({ score }) =>
    score === null ? [] : [score],
  );
  const passed = ordered.flatMap(({ passed: value }) =>
    value === null ? [] : [value ? 1 : 0],
  );
  const timed = ordered.flatMap(({ withinNorm }) =>
    withinNorm === null ? [] : [withinNorm ? 1 : 0],
  );
  const coverage = ordered.flatMap(({ textCoverage }) =>
    textCoverage === null ? [] : [textCoverage],
  );
  const split = Math.max(1, Math.floor(scores.length / 2));
  const early = mean(scores.slice(0, split));
  const late = mean(scores.slice(split));
  return {
    averageScore: mean(scores),
    latestScore: scores.at(-1) ?? null,
    trend: early === null || late === null ? 0 : Math.round(late - early),
    passRate: mean(passed),
    withinNormRate: mean(timed),
    processErrorFrequency:
      ordered.length === 0
        ? 0
        : ordered.filter(({ hasProcessErrors }) => hasProcessErrors).length /
          ordered.length,
    textCoverage: mean(coverage),
    attempts: ordered.length,
  };
}

function baseProbability(features: ReadinessFeatures): number {
  const score = (features.averageScore ?? 0) / 100;
  const latest = (features.latestScore ?? 0) / 100;
  const trend = clamp((features.trend + 20) / 40);
  return clamp(
    score * 0.22 +
      latest * 0.18 +
      (features.passRate ?? 0) * 0.2 +
      (features.withinNormRate ?? 0) * 0.15 +
      (1 - features.processErrorFrequency) * 0.1 +
      (features.textCoverage ?? 0) * 0.1 +
      trend * 0.05,
  );
}

function blockers(features: ReadinessFeatures): string[] {
  const candidates = [
    {
      severity: 0.75 - (features.averageScore ?? 0) / 100,
      text: "Низкий средний балл",
    },
    {
      severity: 0.75 - (features.latestScore ?? 0) / 100,
      text: "Последний результат ниже целевого",
    },
    {
      severity: 0.7 - (features.passRate ?? 0),
      text: "Недостаточная доля успешных попыток",
    },
    {
      severity: 0.8 - (features.withinNormRate ?? 0),
      text: "Норматив времени соблюдается нестабильно",
    },
    {
      severity: features.processErrorFrequency - 0.2,
      text: "Часто повторяются процессные ошибки",
    },
    {
      severity: 0.75 - (features.textCoverage ?? 0),
      text: "Неполно заполняется текст карточки ДДС",
    },
    {
      severity: features.trend < 0 ? Math.abs(features.trend) / 100 : 0,
      text: "Результаты снижаются",
    },
  ];
  // Пустой список честнее выдуманных помех: если ничего не тянет вниз, так и
  // говорим, а не дописываем общие советы.
  return candidates
    .filter(({ severity }) => severity > 0)
    .sort((left, right) => right.severity - left.severity)
    .slice(0, 3)
    .map(({ text }) => text);
}

const BIAS_WEIGHT = 0.25;

/**
 * Прогноз готовности по истории попыток.
 *
 * Качество прогноза меряется честно: каждая проверяемая попытка предсказывается
 * только по тому, что было до неё. Если считать по истории вместе с самой
 * попыткой, модель видит её же оценку — и точность получается любой нужной.
 */
export function predictReadiness(
  observations: readonly ReadinessObservation[],
) {
  const ordered = [...observations].sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt),
  );
  const features = extractReadinessFeatures(ordered);
  const usable = ordered.filter(({ passed }) => passed !== null);
  const trainingCount = Math.floor(usable.length * 0.6);
  const training = usable.slice(0, trainingCount);
  const test = usable.slice(trainingCount);
  /** Ожидаемая готовность к попытке: считается по всему, что было до неё. */
  const probabilityBefore = (position: number) =>
    baseProbability(extractReadinessFeatures(usable.slice(0, position)));

  // Калибруем только сдвиг фиксированной прозрачной формулы на ранней истории.
  // Коэффициенты не обучаются, результат одинаков для одинакового набора данных.
  const calibrated = training.flatMap((observation, index) =>
    index === 0
      ? []
      : [(observation.passed ? 1 : 0) - probabilityBefore(index)],
  );
  const bias =
    calibrated.length === 0
      ? 0
      : calibrated.reduce((sum, value) => sum + value, 0) / calibrated.length;
  const probability = clamp(baseProbability(features) + bias * BIAS_WEIGHT);
  const qualityMeasured =
    usable.length >= QUALITY_MIN_OBSERVATIONS && test.length > 0;
  const accuracy = qualityMeasured
    ? test.filter((observation, index) => {
        const predictedReady =
          clamp(
            probabilityBefore(trainingCount + index) + bias * BIAS_WEIGHT,
          ) >= READY_THRESHOLD;
        return predictedReady === observation.passed;
      }).length / test.length
    : null;
  const insufficient = features.attempts < MIN_OBSERVATIONS;

  return {
    probability: Math.round(probability * 1000) / 1000,
    label: insufficient
      ? ("insufficient" as const)
      : probability >= READY_THRESHOLD
        ? ("ready" as const)
        : ("needs_training" as const),
    blockers: insufficient
      ? [
          "Недостаточно попыток для устойчивого прогноза",
          "Нужны результаты по разным учебным ситуациям",
        ]
      : blockers(features),
    features: {
      ...features,
      averageScore:
        features.averageScore === null
          ? null
          : Math.round(features.averageScore),
      latestScore:
        features.latestScore === null ? null : Math.round(features.latestScore),
      passRate:
        features.passRate === null
          ? null
          : Math.round(features.passRate * 1000) / 1000,
      withinNormRate:
        features.withinNormRate === null
          ? null
          : Math.round(features.withinNormRate * 1000) / 1000,
      processErrorFrequency:
        Math.round(features.processErrorFrequency * 1000) / 1000,
      textCoverage:
        features.textCoverage === null
          ? null
          : Math.round(features.textCoverage * 1000) / 1000,
    },
    quality: {
      status: qualityMeasured
        ? ("measured" as const)
        : ("insufficient" as const),
      accuracy: accuracy === null ? null : Math.round(accuracy * 1000) / 1000,
      observations: usable.length,
      trainingObservations: training.length,
      testObservations: test.length,
    },
  };
}
