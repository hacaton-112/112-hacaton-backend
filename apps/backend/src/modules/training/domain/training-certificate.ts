export interface TrainingCertificateResult {
  readonly attempts: number;
  readonly finalScore: number;
}

/**
 * Сертификат подтверждает достигнутый результат, поэтому берётся лучшая
 * оценённая попытка. Неоценённые и отменённые попытки остаются в общем числе,
 * но не могут сами по себе дать зачёт.
 */
export function trainingCertificateResult(
  scores: readonly (number | null)[],
  passThreshold: number,
): TrainingCertificateResult | null {
  const evaluated = scores.filter((score): score is number => score !== null);
  if (evaluated.length === 0) return null;
  const finalScore = Math.max(...evaluated);
  return finalScore >= passThreshold
    ? { attempts: scores.length, finalScore }
    : null;
}
