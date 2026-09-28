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

type NumberRank = "unit" | "teen" | "tens" | "hundreds";

interface NumberPart {
  readonly value: number;
  readonly rank: NumberRank;
  readonly ordinal?: boolean;
}

const NUMBER_PARTS: Readonly<Record<string, NumberPart>> = {
  ноль: { value: 0, rank: "unit" },
  нуль: { value: 0, rank: "unit" },
  нет: { value: 0, rank: "unit" },
  отсутствуют: { value: 0, rank: "unit" },
  нулевой: { value: 0, rank: "unit", ordinal: true },
  один: { value: 1, rank: "unit" },
  одна: { value: 1, rank: "unit" },
  одно: { value: 1, rank: "unit" },
  первую: { value: 1, rank: "unit", ordinal: true },
  первый: { value: 1, rank: "unit", ordinal: true },
  первая: { value: 1, rank: "unit", ordinal: true },
  первом: { value: 1, rank: "unit", ordinal: true },
  первого: { value: 1, rank: "unit", ordinal: true },
  два: { value: 2, rank: "unit" },
  две: { value: 2, rank: "unit" },
  второй: { value: 2, rank: "unit", ordinal: true },
  вторая: { value: 2, rank: "unit", ordinal: true },
  втором: { value: 2, rank: "unit", ordinal: true },
  второго: { value: 2, rank: "unit", ordinal: true },
  три: { value: 3, rank: "unit" },
  третий: { value: 3, rank: "unit", ordinal: true },
  третья: { value: 3, rank: "unit", ordinal: true },
  третьем: { value: 3, rank: "unit", ordinal: true },
  третьего: { value: 3, rank: "unit", ordinal: true },
  четыре: { value: 4, rank: "unit" },
  четвертый: { value: 4, rank: "unit", ordinal: true },
  четвертая: { value: 4, rank: "unit", ordinal: true },
  четвертом: { value: 4, rank: "unit", ordinal: true },
  четвертого: { value: 4, rank: "unit", ordinal: true },
  пять: { value: 5, rank: "unit" },
  пятый: { value: 5, rank: "unit", ordinal: true },
  пятая: { value: 5, rank: "unit", ordinal: true },
  пятом: { value: 5, rank: "unit", ordinal: true },
  шестого: { value: 6, rank: "unit", ordinal: true },
  шесть: { value: 6, rank: "unit" },
  шестой: { value: 6, rank: "unit", ordinal: true },
  шестая: { value: 6, rank: "unit", ordinal: true },
  шестом: { value: 6, rank: "unit", ordinal: true },
  семь: { value: 7, rank: "unit" },
  седьмой: { value: 7, rank: "unit", ordinal: true },
  седьмая: { value: 7, rank: "unit", ordinal: true },
  седьмом: { value: 7, rank: "unit", ordinal: true },
  восьмого: { value: 8, rank: "unit", ordinal: true },
  восемь: { value: 8, rank: "unit" },
  восьмой: { value: 8, rank: "unit", ordinal: true },
  восьмая: { value: 8, rank: "unit", ordinal: true },
  восьмом: { value: 8, rank: "unit", ordinal: true },
  девять: { value: 9, rank: "unit" },
  девятый: { value: 9, rank: "unit", ordinal: true },
  девятая: { value: 9, rank: "unit", ordinal: true },
  девятом: { value: 9, rank: "unit", ordinal: true },
  девятого: { value: 9, rank: "unit", ordinal: true },
  десять: { value: 10, rank: "teen" },
  одиннадцать: { value: 11, rank: "teen" },
  двенадцать: { value: 12, rank: "teen" },
  тринадцать: { value: 13, rank: "teen" },
  четырнадцать: { value: 14, rank: "teen" },
  пятнадцать: { value: 15, rank: "teen" },
  шестнадцать: { value: 16, rank: "teen" },
  семнадцать: { value: 17, rank: "teen" },
  восемнадцать: { value: 18, rank: "teen" },
  девятнадцать: { value: 19, rank: "teen" },
  десятый: { value: 10, rank: "teen", ordinal: true },
  одиннадцатый: { value: 11, rank: "teen", ordinal: true },
  двенадцатый: { value: 12, rank: "teen", ordinal: true },
  тринадцатый: { value: 13, rank: "teen", ordinal: true },
  четырнадцатый: { value: 14, rank: "teen", ordinal: true },
  пятнадцатый: { value: 15, rank: "teen", ordinal: true },
  шестнадцатый: { value: 16, rank: "teen", ordinal: true },
  семнадцатый: { value: 17, rank: "teen", ordinal: true },
  восемнадцатый: { value: 18, rank: "teen", ordinal: true },
  девятнадцатый: { value: 19, rank: "teen", ordinal: true },
  двадцать: { value: 20, rank: "tens" },
  тридцать: { value: 30, rank: "tens" },
  сорок: { value: 40, rank: "tens" },
  пятьдесят: { value: 50, rank: "tens" },
  шестьдесят: { value: 60, rank: "tens" },
  семьдесят: { value: 70, rank: "tens" },
  восемьдесят: { value: 80, rank: "tens" },
  девяносто: { value: 90, rank: "tens" },
  двадцатый: { value: 20, rank: "tens", ordinal: true },
  тридцатый: { value: 30, rank: "tens", ordinal: true },
  сороковой: { value: 40, rank: "tens", ordinal: true },
  пятидесятый: { value: 50, rank: "tens", ordinal: true },
  шестидесятый: { value: 60, rank: "tens", ordinal: true },
  семидесятый: { value: 70, rank: "tens", ordinal: true },
  восьмидесятый: { value: 80, rank: "tens", ordinal: true },
  девяностый: { value: 90, rank: "tens", ordinal: true },
  сто: { value: 100, rank: "hundreds" },
  двести: { value: 200, rank: "hundreds" },
  триста: { value: 300, rank: "hundreds" },
  четыреста: { value: 400, rank: "hundreds" },
  пятьсот: { value: 500, rank: "hundreds" },
  шестьсот: { value: 600, rank: "hundreds" },
  семьсот: { value: 700, rank: "hundreds" },
  восемьсот: { value: 800, rank: "hundreds" },
  девятьсот: { value: 900, rank: "hundreds" },
};

const normalize = (value: string): string =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * Канонизирует распространённые ASR-варианты адресных чисел от 0 до 999.
 * Составление ограничено корректной последовательностью сотни → десятки →
 * единицы, поэтому соседние независимые поля адреса не склеиваются.
 */
const spokenNumberTokens = (words: readonly string[]): readonly string[] => {
  const result: string[] = [];

  for (let index = 0; index < words.length; index += 1) {
    const first = NUMBER_PARTS[words[index]!];
    if (!first) continue;

    let value = first.value;
    let consumed = 1;
    if (!first.ordinal && first.rank === "hundreds") {
      const second = NUMBER_PARTS[words[index + consumed] ?? ""];
      if (second && ["teen", "tens", "unit"].includes(second.rank)) {
        value += second.value;
        consumed += 1;
        if (!second.ordinal && second.rank === "tens") {
          const third = NUMBER_PARTS[words[index + consumed] ?? ""];
          if (third?.rank === "unit") {
            value += third.value;
            consumed += 1;
          }
        }
      }
    } else if (!first.ordinal && first.rank === "tens") {
      const second = NUMBER_PARTS[words[index + consumed] ?? ""];
      if (second?.rank === "unit") {
        value += second.value;
        consumed += 1;
      }
    }

    result.push(String(value));
    index += consumed - 1;
  }

  return result;
};

const tokens = (value: string): readonly string[] => {
  const words = normalize(value).split(/\s+/u);
  const lexical = words.filter(
    (token) =>
      !NUMBER_PARTS[token] &&
      (/^\d+$/u.test(token) || token.length > 1) &&
      !STOP_WORDS.has(token),
  );
  return [...lexical, ...spokenNumberTokens(words)];
};

const editDistance = (left: string, right: string): number => {
  let previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution =
        previous[rightIndex - 1]! +
        (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        previous[rightIndex]! + 1,
        current[rightIndex - 1]! + 1,
        substitution,
      );
    }
    previous = current;
  }

  return previous[right.length]!;
};

/**
 * ASR и падежи меняют окончания русских слов. Сравниваем длинную общую основу,
 * но не прибегаем к вероятностной модели: одинаковый текст всегда даёт тот же
 * результат.
 */
const tokenMatches = (expected: string, actual: string): boolean => {
  if (expected === actual) return true;
  if (/^\d+$/u.test(expected) || /^\d+$/u.test(actual)) return false;

  const common = Math.min(expected.length, actual.length, 5);
  if (common >= 4 && expected.slice(0, common) === actual.slice(0, common)) {
    return true;
  }

  // ASR иногда заменяет одну гласную или согласную внутри длинного слова.
  // Допускаем малую редакционную ошибку только для слов, но никогда для чисел:
  // номер дома и количество пострадавших обязаны совпасть точно.
  const longest = Math.max(expected.length, actual.length);
  const tolerance = longest >= 8 ? 2 : longest >= 4 ? 1 : 0;
  return (
    tolerance > 0 &&
    Math.abs(expected.length - actual.length) <= tolerance &&
    editDistance(expected, actual) <= tolerance
  );
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
  const numbersCovered = numbers.every((number) => actual.includes(number));
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
  return actual.includes(String(victimsTotal));
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
