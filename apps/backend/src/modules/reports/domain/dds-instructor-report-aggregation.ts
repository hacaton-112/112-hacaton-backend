import type { DdsProcessErrorType } from "@/modules/dds-exercise/domain/dds-report-aggregation";

export interface InstructorDdsCardInput {
  exerciseId: string;
  operatorId: string;
  operatorName: string;
  lessonId: string | null;
  lessonTitle: string | null;
  occurredAt: string;
  finalStatus: string;
  automaticScore: number | null;
  finalScore: number | null;
  passThreshold: number;
  withinNorm: boolean | null;
  processErrors: readonly DdsProcessErrorType[];
  coverage: readonly {
    id: string;
    label: string;
    status: "present" | "missing";
  }[];
}

export function summarizeInstructorDds(
  cards: readonly InstructorDdsCardInput[],
) {
  const average = (values: number[]) =>
    values.length
      ? Math.round(
          values.reduce((sum, value) => sum + value, 0) / values.length,
        )
      : null;
  const automaticScores = cards.flatMap(({ automaticScore }) =>
    automaticScore === null ? [] : [automaticScore],
  );
  const finalScores = cards.flatMap(({ finalScore }) =>
    finalScore === null ? [] : [finalScore],
  );
  const timed = cards.filter(({ withinNorm }) => withinNorm !== null);
  const outcomes = new Map<string, number>();
  const errors = new Map<DdsProcessErrorType, number>();
  const missing = new Map<string, number>();
  for (const card of cards) {
    outcomes.set(card.finalStatus, (outcomes.get(card.finalStatus) ?? 0) + 1);
    card.processErrors.forEach((type) =>
      errors.set(type, (errors.get(type) ?? 0) + 1),
    );
    card.coverage
      .filter(({ status }) => status === "missing")
      .forEach(({ label }) =>
        missing.set(label, (missing.get(label) ?? 0) + 1),
      );
  }
  const coverageItems = cards.flatMap(({ coverage }) => coverage);
  const lessons = new Map<
    string,
    { lessonId: string; title: string; occurredAt: string; scores: number[] }
  >();
  for (const card of cards) {
    if (!card.lessonId || !card.lessonTitle) continue;
    const row = lessons.get(card.lessonId) ?? {
      lessonId: card.lessonId,
      title: card.lessonTitle,
      occurredAt: card.occurredAt,
      scores: [],
    };
    if (card.finalScore !== null) row.scores.push(card.finalScore);
    lessons.set(card.lessonId, row);
  }
  return {
    cards: cards.length,
    averageScore: average(automaticScores),
    finalScore: average(finalScores),
    withinNormPercent:
      timed.length === 0
        ? null
        : Math.round(
            (timed.filter(({ withinNorm }) => withinNorm).length /
              timed.length) *
              100,
          ),
    outcomes: [...outcomes].map(([status, count]) => ({ status, count })),
    topErrors: [...errors]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([type, count]) => ({ type, count })),
    averageCoveragePercent:
      coverageItems.length === 0
        ? null
        : Math.round(
            (coverageItems.filter(({ status }) => status === "present").length /
              coverageItems.length) *
              100,
          ),
    scoreDynamics: [...lessons.values()]
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      .map(({ scores, ...lesson }) => ({ ...lesson, score: average(scores) })),
    weakPoints: [...missing]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count })),
    recentAttempts: [...cards]
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, 10)
      .map(
        ({ exerciseId, lessonTitle, occurredAt, finalStatus, finalScore }) => ({
          exerciseId,
          lessonTitle,
          occurredAt,
          finalStatus,
          finalScore,
        }),
      ),
  };
}
