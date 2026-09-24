import type { UserRole } from "@/drizzle/schema";

/** Чем закончилась карточка: по нему фильтруют архив чаще всего. */
export const DDS_ARCHIVE_OUTCOMES = ["passed", "failed", "unfinished"] as const;
export type DdsArchiveOutcome = (typeof DDS_ARCHIVE_OUTCOMES)[number];

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

export interface ArchivePeriod {
  readonly since: Date | null;
  readonly until: Date | null;
}

/**
 * Период поиска из двух дат в архиве.
 *
 * Обе границы включительны: диспетчер, задавший «с 1 по 3 сентября», ожидает
 * увидеть и карточки третьего числа. Поэтому верхняя граница сдвигается на
 * сутки вперёд и сравнивается строгим «меньше».
 */
export function archivePeriod(from?: string, to?: string): ArchivePeriod {
  const since = from ? new Date(`${from}T00:00:00.000Z`) : null;
  const until = to
    ? new Date(new Date(`${to}T00:00:00.000Z`).getTime() + MILLISECONDS_PER_DAY)
    : null;

  if (since && Number.isNaN(since.getTime()))
    throw new RangeError("Invalid period start");
  if (until && Number.isNaN(until.getTime()))
    throw new RangeError("Invalid period end");
  if (since && until && until <= since)
    throw new RangeError("The period ends before it starts");

  return { since, until };
}

/**
 * Шаблон для поиска подстроки.
 *
 * `%` и `_` в запросе — обычные символы адреса или описания, а не подстановка:
 * без экранирования поиск по «_» вернул бы весь архив.
 */
export function likePattern(search: string): string {
  const escaped = search
    .trim()
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  return `%${escaped}%`;
}

/**
 * Чей архив видно.
 *
 * Обучающийся видит только свои карточки, даже если попросит чужие:
 * преподаватель и администратор — любые, и могут сузить архив до одного
 * обучающегося.
 */
export function archiveOwner(
  role: UserRole,
  viewerId: string,
  requestedOperatorId?: string,
): string | null {
  if (role === "operator") return viewerId;
  return requestedOperatorId ?? null;
}
