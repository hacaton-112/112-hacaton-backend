/**
 * Дата без времени в обе стороны.
 *
 * Контракты хранят такие поля строкой «ГГГГ-ММ-ДД», а выбор даты работает с
 * `Date`. Преобразование идёт по местному времени: разбор через `new Date`
 * сдвинул бы дату на сутки в часовых поясах восточнее Гринвича.
 */
export const toDate = (value?: string | null): Date | null => {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

export const toDateOnly = (
  value: Date | { year: number; month: number; day: number } | null,
): string | null => {
  if (!value) return null;

  const year = value instanceof Date ? value.getFullYear() : value.year;
  const month = value instanceof Date ? value.getMonth() + 1 : value.month;
  const day = value instanceof Date ? value.getDate() : value.day;

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
