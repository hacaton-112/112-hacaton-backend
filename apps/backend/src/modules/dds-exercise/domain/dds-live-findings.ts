import {
  CREW_HANDOFF_NORM_MS,
  type DdsCrewHandoff,
} from "./dds-exercise-evaluation";

/**
 * Что преподаватель видит по идущей попытке.
 *
 * Это наблюдение, а не оценка: попытка ещё не завершена, баллы считает
 * `evaluateDdsExercise` в терминальном статусе. Коды намеренно другие, чтобы
 * незавершённое наблюдение нельзя было принять за нарушение в протоколе.
 */
export const DDS_LIVE_FINDINGS = [
  /** Норматив первичного статуса истёк, карточка так и не принята. */
  "acknowledgement_overdue",
  /** Первичный статус поставлен, но позже норматива. */
  "acknowledged_late",
  /** Карточка принята, а нужный наряд не вызван дольше норматива передачи. */
  "crew_handoff_overdue",
  /** До нужного наряда набирали чужой или несуществующий номер. */
  "wrong_crew_dialed",
] as const;

export type DdsLiveFinding = (typeof DDS_LIVE_FINDINGS)[number];

export interface DdsLiveFindingsInput {
  readonly acknowledgementDeadlineAt: Date;
  readonly acknowledgedAt: Date | null;
  /** Передаётся только при включённой телефонии: без неё звонить некуда. */
  readonly handoff?: DdsCrewHandoff | null;
  readonly now: Date;
}

export function ddsLiveFindings(input: DdsLiveFindingsInput): DdsLiveFinding[] {
  const findings: DdsLiveFinding[] = [];

  if (input.acknowledgedAt === null) {
    if (input.now.getTime() > input.acknowledgementDeadlineAt.getTime()) {
      findings.push("acknowledgement_overdue");
    }
  } else if (
    input.acknowledgedAt.getTime() > input.acknowledgementDeadlineAt.getTime()
  ) {
    findings.push("acknowledged_late");
  }

  const handoff = input.handoff;

  if (handoff && input.acknowledgedAt !== null) {
    // Норматив передачи считается от принятия карточки: до него звонить рано.
    const since = input.acknowledgedAt.getTime();
    const called = handoff.completedCallStartedAt?.getTime() ?? null;
    const elapsed = (called ?? input.now.getTime()) - since;

    if (elapsed > CREW_HANDOFF_NORM_MS) findings.push("crew_handoff_overdue");
  }

  if (handoff && handoff.wrongCallsBefore > 0) {
    findings.push("wrong_crew_dialed");
  }

  return findings;
}
