import { expandRussianAddressAbbreviations } from "@/common/utils/russian-text";
import type { ScenarioFact } from "./disclosure";

const STOP_WORDS = new Set([
  "а",
  "без",
  "в",
  "во",
  "для",
  "до",
  "и",
  "из",
  "к",
  "на",
  "не",
  "но",
  "о",
  "по",
  "под",
  "с",
  "со",
  "у",
  "это",
  "я",
]);

const SMALL_NUMBERS: Readonly<Record<string, number>> = {
  ноль: 0,
  один: 1,
  одна: 1,
  одно: 1,
  // Собирательные: «там двое детей» — самая частая форма числа в ответах.
  двое: 2,
  трое: 3,
  четверо: 4,
  пятеро: 5,
  первый: 1,
  первая: 1,
  первое: 1,
  два: 2,
  две: 2,
  второй: 2,
  вторая: 2,
  второе: 2,
  три: 3,
  третий: 3,
  третья: 3,
  третье: 3,
  четыре: 4,
  четвертый: 4,
  четвертая: 4,
  четвертое: 4,
  пять: 5,
  пятый: 5,
  пятая: 5,
  шестой: 6,
  шесть: 6,
  семь: 7,
  седьмой: 7,
  восемь: 8,
  восьмой: 8,
  девять: 9,
  девятый: 9,
  десять: 10,
  десятый: 10,
  одиннадцать: 11,
  двенадцать: 12,
  тринадцать: 13,
  четырнадцать: 14,
  пятнадцать: 15,
  шестнадцать: 16,
  семнадцать: 17,
  восемнадцать: 18,
  девятнадцать: 19,
};
const TENS: Readonly<Record<string, number>> = {
  двадцать: 20,
  тридцать: 30,
  сорок: 40,
  пятьдесят: 50,
  шестьдесят: 60,
  семьдесят: 70,
  восемьдесят: 80,
  девяносто: 90,
};
const HUNDREDS: Readonly<Record<string, number>> = {
  сто: 100,
  двести: 200,
  триста: 300,
  четыреста: 400,
  пятьсот: 500,
  шестьсот: 600,
  семьсот: 700,
  восемьсот: 800,
  девятьсот: 900,
};
const ORDINAL_STEMS: readonly [string, number][] = [
  ["одиннадцат", 11],
  ["двенадцат", 12],
  ["тринадцат", 13],
  ["четырнадцат", 14],
  ["пятнадцат", 15],
  ["шестнадцат", 16],
  ["семнадцат", 17],
  ["восемнадцат", 18],
  ["девятнадцат", 19],
  ["перв", 1],
  ["втор", 2],
  ["трет", 3],
  ["четверт", 4],
  ["пят", 5],
  ["шест", 6],
  ["седьм", 7],
  ["восьм", 8],
  ["девят", 9],
  ["десят", 10],
];

/**
 * Родовые слова адреса не отличают один адрес от другого: «не знаю, какая
 * улица» не называет «Улица Учебная». Факт засчитывается по имени улицы.
 */
const GENERIC_ADDRESS_STEMS = new Set([
  "улиц",
  "квар",
  "подъ",
  "этаж",
  "корп",
  "шосс",
  "обла",
  "микр",
]);

const normalize = (text: string): string =>
  expandRussianAddressAbbreviations(text)
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

const numberWord = (word: string): number | undefined =>
  SMALL_NUMBERS[word] ??
  TENS[word] ??
  HUNDREDS[word] ??
  ORDINAL_STEMS.find(([stem]) => word.startsWith(stem))?.[1];

/** Числа цифрами и русскими словами; составные формы поддерживаются до тысяч. */
export const russianNumbers = (text: string): readonly number[] => {
  const words = normalize(text).split(" ").filter(Boolean);
  const numbers: number[] = [];
  for (let index = 0; index < words.length;) {
    const numeric = Number(words[index]);
    if (Number.isInteger(numeric)) {
      numbers.push(numeric);
      index += 1;
      continue;
    }

    let cursor = index;
    let value = 0;
    let found = false;
    while (cursor < words.length) {
      const word = words[cursor]!;
      if (/^тысяч/u.test(word)) {
        value = Math.max(1, value) * 1_000;
        found = true;
        cursor += 1;
        continue;
      }
      const part = numberWord(word);
      if (part === undefined) break;
      value += part;
      found = true;
      cursor += 1;
    }
    if (found) {
      numbers.push(value);
      index = cursor;
    } else {
      index += 1;
    }
  }
  return numbers;
};

const significantStems = (text: string): readonly string[] =>
  normalize(text)
    .split(" ")
    .filter(
      (word) =>
        word.length >= 4 &&
        !STOP_WORDS.has(word) &&
        !/^\d+$/u.test(word) &&
        numberWord(word) === undefined &&
        !/^тысяч/u.test(word) &&
        !GENERIC_ADDRESS_STEMS.has(word.slice(0, 4)),
    )
    .map((word) => word.slice(0, word.length >= 5 ? 5 : 4));

export const callerV2CarriesFact = (text: string, fact: string): boolean => {
  const spokenNumbers = new Set(russianNumbers(text));
  const factNumbers = russianNumbers(fact);
  if (
    factNumbers.length > 0 &&
    factNumbers.every((number) => spokenNumbers.has(number))
  ) {
    return true;
  }

  const spokenStems = new Set(significantStems(text));
  const factStems = significantStems(fact);
  if (factStems.length === 0) return false;
  const matched = factStems.filter((stem) => spokenStems.has(stem)).length;
  const required = Math.ceil(factStems.length * 0.5);
  return matched >= required;
};

export const callerV2FactsCarriedBy = (
  text: string,
  facts: readonly ScenarioFact[],
): readonly string[] =>
  facts
    .filter((fact) => callerV2CarriesFact(text, fact.promptValue))
    .map((fact) => fact.key);
