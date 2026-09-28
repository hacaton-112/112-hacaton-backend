import type { TrainingAttemptStatus } from "@/drizzle/schema";

/** Попытка глазами занятия: идёт ли она ещё и зачтена ли. */
export interface LessonAttempt {
  readonly status: TrainingAttemptStatus;
  readonly passed: boolean;
}

const RUNNING: readonly TrainingAttemptStatus[] = ["offered", "active"];

/**
 * Больше ли ученику нечего делать в занятии.
 *
 * Идущая попытка держит занятие открытым. Зачтённая попытка закрывает его для
 * ученика сразу: пересдавать сданное незачем. Незачтённые попытки закрывают
 * его, только когда исчерпан лимит, — пока попытки остаются, ученик может
 * пройти занятие ещё раз. Без лимита незачтённый ученик не заканчивает никогда.
 */
export function learnerFinished(
  attempts: readonly LessonAttempt[],
  maxAttempts: number | null,
): boolean {
  if (attempts.some(({ status }) => RUNNING.includes(status))) return false;
  if (attempts.some(({ passed }) => passed)) return true;

  return maxAttempts !== null && attempts.length >= maxAttempts;
}

/** Закончили ли занятие все, кому оно адресовано. Пустое занятие не закончено. */
export function everyLearnerFinished(
  learners: readonly string[],
  attemptsByLearner: ReadonlyMap<string, readonly LessonAttempt[]>,
  maxAttempts: number | null,
): boolean {
  return (
    learners.length > 0 &&
    learners.every((learner) =>
      learnerFinished(attemptsByLearner.get(learner) ?? [], maxAttempts),
    )
  );
}
