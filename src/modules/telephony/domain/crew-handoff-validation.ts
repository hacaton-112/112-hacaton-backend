import type { DdsCardSnapshot } from "@/modules/dds-exercise/dto/dds-exercise.dto";

export const CREW_HANDOFF_FIELDS = [
  "address",
  "incident",
  "description",
  "victims",
] as const;

export type CrewHandoffField = (typeof CREW_HANDOFF_FIELDS)[number];

export interface CrewHandoffValidation {
  readonly complete: boolean;
  readonly coveredFields: readonly CrewHandoffField[];
  readonly missingFields: readonly CrewHandoffField[];
}

const STOP_WORDS = new Set([
  "а",
  "без",
  "был",
  "была",
  "были",
  "в",
  "во",
  "возле",
  "для",
  "до",
  "дом",
  "дома",
  "за",
  "и",
  "из",
  "к",
  "как",
  "корпус",
  "на",
  "над",
  "не",
  "но",
  "о",
  "около",
  "от",
  "по",
  "под",
  "при",
  "про",
  "с",
  "со",
  "строение",
  "у",
  "улица",
  "что",
  "это",
]);

const NUMBER_WORDS: Readonly<Record<number, readonly string[]>> = {
  0: ["0", "ноль", "нет", "отсутствуют"],
  1: ["1", "один", "одна", "одно"],
  2: ["2", "два", "две"],
  3: ["3", "три"],
  4: ["4", "четыре"],
  5: ["5", "пять"],
  6: ["6", "шесть"],
  7: ["7", "семь"],
  8: ["8", "восемь"],
  9: ["9", "девять"],
  10: ["10", "десять"],
  11: ["11", "одиннадцать"],
  12: ["12", "двенадцать"],
  13: ["13", "тринадцать"],
  14: ["14", "четырнадцать"],
  15: ["15", "пятнадцать"],
  16: ["16", "шестнадцать"],
  17: ["17", "семнадцать"],
  18: ["18", "восемнадцать"],
  19: ["19", "девятнадцать"],
  20: ["20", "двадцать"],
};

const normalize = (value: string): string =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const tokens = (value: string): readonly string[] =>
  normalize(value)
    .split(/\s+/u)
    .filter(
      (token) =>
        (/^\d+$/u.test(token) || token.length > 1) && !STOP_WORDS.has(token),
    );

/**
 * ASR и падежи меняют окончания русских слов. Сравниваем длинную общую основу,
 * но не прибегаем к вероятностной модели: одинаковый текст всегда даёт тот же
 * результат.
 */
const tokenMatches = (expected: string, actual: string): boolean => {
  if (expected === actual) return true;
  if (/^\d+$/u.test(expected) || /^\d+$/u.test(actual)) return false;

  const common = Math.min(expected.length, actual.length, 5);
  return common >= 4 && expected.slice(0, common) === actual.slice(0, common);
};

const countMatches = (
  expected: readonly string[],
  actual: readonly string[],
): number =>
  expected.filter((word) => actual.some((heard) => tokenMatches(word, heard)))
    .length;

const textCovered = (
  expectedText: string,
  actual: readonly string[],
  ratio: number,
  minimum: number,
): boolean => {
  const expected = [...new Set(tokens(expectedText))];
  if (expected.length === 0) return true;
  const required = Math.min(
    expected.length,
    Math.max(minimum, Math.ceil(expected.length * ratio)),
  );
  return countMatches(expected, actual) >= required;
};

const addressCovered = (
  address: string,
  actual: readonly string[],
): boolean => {
  const expected = [...new Set(tokens(address))];
  const numbers = expected.filter((word) => /^\d+$/u.test(word));
  const words = expected.filter((word) => !/^\d+$/u.test(word));
  const numbersCovered = numbers.every((number) => {
    const variants = NUMBER_WORDS[Number(number)] ?? [number];
    return variants.some((variant) => actual.includes(variant));
  });
  const requiredWords = Math.min(
    words.length,
    Math.max(1, Math.ceil(words.length * 0.6)),
  );

  return numbersCovered && countMatches(words, actual) >= requiredWords;
};

const victimsCovered = (
  victimsTotal: number | null,
  actual: readonly string[],
): boolean => {
  if (victimsTotal === null) return true;
  const variants = NUMBER_WORDS[victimsTotal] ?? [String(victimsTotal)];
  return variants.some((variant) => actual.includes(variant));
};

/**
 * Проверяет только факты неизменяемого снимка карточки. LLM здесь нет: наряд
 * принимает передачу воспроизводимо и не может додумать недостающие сведения.
 */
export const validateCrewHandoff = (
  card: DdsCardSnapshot,
  transcript: string,
): CrewHandoffValidation => {
  const heard = tokens(transcript);
  const covered = new Set<CrewHandoffField>();

  if (addressCovered(card.addressText, heard)) covered.add("address");
  if (textCovered(`${card.title} ${card.incidentType}`, heard, 0.35, 1)) {
    covered.add("incident");
  }
  if (textCovered(card.description, heard, 0.3, 2)) {
    covered.add("description");
  }
  if (victimsCovered(card.victimsTotal, heard)) covered.add("victims");

  const coveredFields = CREW_HANDOFF_FIELDS.filter((field) =>
    covered.has(field),
  );
  const missingFields = CREW_HANDOFF_FIELDS.filter(
    (field) => !covered.has(field),
  );

  return {
    complete: missingFields.length === 0,
    coveredFields,
    missingFields,
  };
};
