/**
 * Возвращает ровно одну, самую свежую версию каждого сценария.
 *
 * История версий остаётся неизменной, но рабочие выборки и переносимый пакет
 * не должны случайно получить устаревший снимок из-за порядка строк в БД.
 */
export function latestVersionPerScenario<
  T extends { scenarioId: string; version: number },
>(versions: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const row of versions) {
    const known = latest.get(row.scenarioId);
    if (!known || known.version < row.version) latest.set(row.scenarioId, row);
  }
  return [...latest.values()];
}
