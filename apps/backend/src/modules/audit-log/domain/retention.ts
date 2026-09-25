const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

/**
 * Граница хранения: всё, что старше, journal уже не обязан помнить.
 *
 * Срок считается от момента уборки, а не от начала суток: журнал не отчётность,
 * и ровные календарные границы ему ничего не дают.
 */
export function retentionCutoff(now: Date, retentionDays: number): Date {
  if (!Number.isFinite(retentionDays) || retentionDays < 1) {
    throw new RangeError("Retention must be at least one day");
  }

  return new Date(now.getTime() - retentionDays * MILLISECONDS_PER_DAY);
}

/**
 * Пора ли убирать снова.
 *
 * Уборка идёт партиями, и после полной партии почти наверняка осталось ещё:
 * продолжаем, пока партия приходит целиком.
 */
export const hasMoreToDelete = (deleted: number, batchSize: number): boolean =>
  deleted >= batchSize;
