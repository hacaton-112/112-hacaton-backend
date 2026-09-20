import type { DdsResponseStatus } from "./dds-response-status";

/** Веса без телефонии: норматив первичного статуса и исход реагирования. */
const ACKNOWLEDGEMENT_WEIGHT = 40;
const COMPLETION_WEIGHT = 60;
const REFUSAL_WEIGHT = 20;

/**
 * Веса с телефонией: часть балла уходит на передачу карточки наряду.
 *
 * Сумма по-прежнему 100, порог зачёта тот же, поэтому результаты с телефонией
 * и без неё читаются одинаково.
 */
const HANDOFF_ACKNOWLEDGEMENT_WEIGHT = 30;
const HANDOFF_WEIGHT = 30;
const LATE_HANDOFF_WEIGHT = 15;
const WRONG_CALL_PENALTY = 10;
const HANDOFF_COMPLETION_WEIGHT = 40;
const HANDOFF_REFUSAL_WEIGHT = 15;

const PASS_THRESHOLD = 75;

/** Норматив передачи: от первичного статуса до звонка нужному наряду. */
export const CREW_HANDOFF_NORM_MS = 60_000;

export const DDS_EXERCISE_VIOLATIONS = [
  "acknowledgement_deadline_missed",
  "response_refused",
  /** Наряду позвонили позже норматива после принятия карточки. */
  "crew_handoff_late",
  /** До нужного наряда набирали чужой или несуществующий номер. */
  "wrong_crew_dialed",
  /** Реагирование завершено, а карточку наряду так и не передали. */
  "crew_handoff_missing",
] as const;

export type DdsExerciseViolation = (typeof DDS_EXERCISE_VIOLATIONS)[number];

export interface DdsExerciseEvaluation {
  readonly score: number;
  readonly passed: boolean;
  readonly acknowledgementMet: boolean;
  readonly terminalStatus: "completed" | "refused";
  readonly violations: DdsExerciseViolation[];
}

/**
 * Передача карточки наряду по телефону.
 *
 * Передаётся только при включённой телефонии: без неё звонить некуда, и оценка
 * остаётся прежней.
 */
export interface DdsCrewHandoff {
  /** Начало первого звонка нужному наряду, который наряд принял. */
  readonly completedCallStartedAt: Date | null;
  /** Сколько раз до этого набрали чужой или несуществующий номер. */
  readonly wrongCallsBefore: number;
}

/**
 * Оценка ответа ДДС.
 *
 * Службу выбирает оператор 112, поэтому завершённое реагирование — успешный
 * путь, а задокументированный отказ получает баллы за процесс, но сам по себе
 * зачёта не даёт.
 */
export function evaluateDdsExercise(input: {
  readonly status: DdsResponseStatus;
  readonly acknowledgementDeadlineAt: Date;
  readonly acknowledgedAt: Date | null;
  readonly handoff?: DdsCrewHandoff;
  readonly passThreshold?: number;
}): DdsExerciseEvaluation | null {
  if (input.status !== "completed" && input.status !== "refused") {
    return null;
  }

  const acknowledgementMet =
    input.acknowledgedAt !== null &&
    input.acknowledgedAt.getTime() <= input.acknowledgementDeadlineAt.getTime();
  const violations: DdsExerciseViolation[] = [];

  if (!acknowledgementMet) {
    violations.push("acknowledgement_deadline_missed");
  }

  if (input.status === "refused") {
    violations.push("response_refused");
  }

  const score =
    input.handoff === undefined
      ? (acknowledgementMet ? ACKNOWLEDGEMENT_WEIGHT : 0) +
        (input.status === "completed" ? COMPLETION_WEIGHT : REFUSAL_WEIGHT)
      : (acknowledgementMet ? HANDOFF_ACKNOWLEDGEMENT_WEIGHT : 0) +
        handoffScore(
          input.status,
          input.acknowledgedAt,
          input.handoff,
          violations,
        ) +
        (input.status === "completed"
          ? HANDOFF_COMPLETION_WEIGHT
          : HANDOFF_REFUSAL_WEIGHT);

  return {
    score,
    passed: score >= (input.passThreshold ?? PASS_THRESHOLD),
    acknowledgementMet,
    terminalStatus: input.status,
    violations,
  };
}

function handoffScore(
  status: "completed" | "refused",
  acknowledgedAt: Date | null,
  handoff: DdsCrewHandoff,
  violations: DdsExerciseViolation[],
): number {
  if (handoff.completedCallStartedAt === null) {
    // Отказ до звонка — законный исход: наряд не поднимают на карточку,
    // которую служба не приняла. Завершить работу без наряда нельзя.
    if (status === "completed") violations.push("crew_handoff_missing");
    return 0;
  }

  if (handoff.wrongCallsBefore > 0) violations.push("wrong_crew_dialed");

  const late =
    acknowledgedAt === null ||
    handoff.completedCallStartedAt.getTime() - acknowledgedAt.getTime() >
      CREW_HANDOFF_NORM_MS;
  if (late) violations.push("crew_handoff_late");

  return Math.max(
    0,
    (late ? LATE_HANDOFF_WEIGHT : HANDOFF_WEIGHT) -
      handoff.wrongCallsBefore * WRONG_CALL_PENALTY,
  );
}
