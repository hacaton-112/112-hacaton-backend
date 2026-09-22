/** Рабочий норматив завершения карточки: в материалах кейса отдельное значение не задано. */
export const DDS_COMPLETION_NORM_SECONDS = 600;

/**
 * Ошибки, которые видны по итогам карточки.
 *
 * Порядок статусов сервер не даёт нарушить, поэтому здесь не переходы, а
 * решения диспетчера: вовремя ли принял, тем ли закончил, что ждал эталон.
 */
export const DDS_PROCESS_ERROR_TYPES = [
  "late_acknowledgement",
  "unexpected_refusal",
  "missed_refusal",
  "unfinished",
] as const;
export type DdsProcessErrorType = (typeof DDS_PROCESS_ERROR_TYPES)[number];

/** Подписи для выгрузки: преподаватель читает отчёт, а не коды. */
export const DDS_PROCESS_ERROR_LABELS: Record<DdsProcessErrorType, string> = {
  late_acknowledgement: "Карточка принята позже норматива",
  unexpected_refusal: "Отказ по карточке, которую нужно было отработать",
  missed_refusal: "Карточка отработана, хотя ожидался отказ",
  unfinished: "Карточка не закрыта к концу занятия",
};

export const DDS_STATUS_LABELS: Record<string, string> = {
  pending: "Не принята",
  not_accepted: "Не принята",
  accepted: "Принята",
  responding: "Выезд",
  arrived: "На месте",
  working: "Работы ведутся",
  completed: "Работы завершены",
  refused: "Отказ",
  lesson_finished: "Занятие завершено",
};

export interface DdsReportTiming {
  reactionSeconds: number | null;
  reactionNormSeconds: number;
  reactionWithinNorm: boolean | null;
  completionSeconds: number | null;
  completionNormSeconds: number;
  completionWithinNorm: boolean | null;
}

const secondsBetween = (from: Date, to: Date | null): number | null =>
  to === null
    ? null
    : Math.max(0, Math.round((to.getTime() - from.getTime()) / 1_000));

export function buildDdsReportTiming(input: {
  createdAt: Date;
  acceptedAt: Date | null;
  completedAt: Date | null;
  reactionNormSeconds: number;
  completionNormSeconds?: number;
}): DdsReportTiming {
  const reactionSeconds = secondsBetween(input.createdAt, input.acceptedAt);
  const completionSeconds = secondsBetween(input.createdAt, input.completedAt);
  const completionNormSeconds =
    input.completionNormSeconds ?? DDS_COMPLETION_NORM_SECONDS;
  return {
    reactionSeconds,
    reactionNormSeconds: input.reactionNormSeconds,
    reactionWithinNorm:
      reactionSeconds === null
        ? null
        : reactionSeconds <= input.reactionNormSeconds,
    completionSeconds,
    completionNormSeconds,
    completionWithinNorm:
      completionSeconds === null
        ? null
        : completionSeconds <= completionNormSeconds,
  };
}

export function detectDdsProcessErrors(input: {
  terminalStatus: string;
  expectedOutcome: "accept" | "refuse" | null;
  timing: DdsReportTiming;
}): DdsProcessErrorType[] {
  const errors: DdsProcessErrorType[] = [];
  // Не принятая до конца занятия карточка тоже просрочена.
  if (
    input.timing.reactionWithinNorm === false ||
    (input.timing.reactionSeconds === null &&
      input.terminalStatus === "lesson_finished")
  )
    errors.push("late_acknowledgement");
  if (input.terminalStatus === "refused" && input.expectedOutcome === "accept")
    errors.push("unexpected_refusal");
  if (
    input.terminalStatus === "completed" &&
    input.expectedOutcome === "refuse"
  )
    errors.push("missed_refusal");
  if (input.terminalStatus === "lesson_finished") errors.push("unfinished");
  return errors;
}

export interface DdsReportSummaryInput {
  score: number | null;
  timing: DdsReportTiming;
  processErrors: readonly DdsProcessErrorType[];
  finalStatus: string;
}

export function summarizeDdsLessonReport(
  cards: readonly DdsReportSummaryInput[],
) {
  const scores = cards.flatMap(({ score }) => (score === null ? [] : [score]));
  const errorCounts = new Map<DdsProcessErrorType, number>();
  const outcomes: Record<string, number> = {};
  for (const card of cards) {
    for (const error of card.processErrors)
      errorCounts.set(error, (errorCounts.get(error) ?? 0) + 1);
    outcomes[card.finalStatus] = (outcomes[card.finalStatus] ?? 0) + 1;
  }
  const timed = cards.filter(
    ({ timing }) =>
      timing.reactionWithinNorm !== null &&
      timing.completionWithinNorm !== null,
  );
  return {
    cards: cards.length,
    averageScore:
      scores.length === 0
        ? null
        : Math.round(
            scores.reduce((sum, score) => sum + score, 0) / scores.length,
          ),
    minScore: scores.length === 0 ? null : Math.min(...scores),
    maxScore: scores.length === 0 ? null : Math.max(...scores),
    withinNormPercent:
      timed.length === 0
        ? null
        : Math.round(
            (timed.filter(
              ({ timing }) =>
                timing.reactionWithinNorm && timing.completionWithinNorm,
            ).length /
              timed.length) *
              100,
          ),
    topErrors: [...errorCounts.entries()]
      .sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      )
      .slice(0, 3)
      .map(([type, count]) => ({ type, count })),
    outcomes: Object.entries(outcomes)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([status, count]) => ({ status, count })),
  };
}
