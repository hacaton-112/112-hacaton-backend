import type {
  GrammarIssue,
  GrammarSeverity,
  GrammarTextStyle,
} from "./grammar-issue";

/**
 * Проверки текста, который набрал человек.
 *
 * Правила детерминированные и работают без сети: отчёт о занятии обязан
 * повторяться на тех же данных, а учебный комплекс — работать в контуре без
 * внешних сервисов. Модель подключается отдельно и только по запросу
 * преподавателя.
 *
 * Каждое правило намеренно осторожное. В карточке происшествия пишут коротко и
 * своими словами — «д. 12», «кв. 3А», «МЧС», — и ложное замечание здесь хуже
 * пропущенного: стажёр перестанет читать отчёт.
 */

const CYRILLIC = /[а-яё]/i;
const LATIN = /[a-z]/i;

/** Латинские буквы, неотличимые на вид от русских: ими и промахиваются. */
const CONFUSABLE_TO_CYRILLIC: Record<string, string> = {
  a: "а",
  c: "с",
  e: "е",
  o: "о",
  p: "р",
  x: "х",
  y: "у",
  A: "А",
  B: "В",
  C: "С",
  E: "Е",
  H: "Н",
  K: "К",
  M: "М",
  O: "О",
  P: "Р",
  T: "Т",
  X: "Х",
};

/** Короткое слово повторяют осмысленно: «по по́лю», «да да». */
const MIN_REPEATED_WORD_LENGTH = 3;
/** Слово короче этого — сокращение вроде «МЧС» или «МОСГАЗ», а не крик. */
const MIN_CAPS_LOCK_WORD_LENGTH = 4;
/** Крик — это фраза: одно длинное слово заглавными встречается и в названии. */
const MIN_CAPS_LOCK_WORDS = 2;
/** «12А» — нормальный номер квартиры, «5этаж» — слипшееся слово. */
const MIN_GLUED_WORD_LENGTH = 3;

const issue = (
  kind: GrammarIssue["kind"],
  severity: GrammarSeverity,
  offset: number,
  fragment: string,
  message: string,
  suggestion: string | null = null,
): GrammarIssue => ({
  kind,
  severity,
  offset,
  length: fragment.length,
  fragment,
  message,
  suggestion,
});

/** Слова вместе с их позицией: правилам нужна и та, и другая. */
const words = (text: string): { word: string; offset: number }[] => {
  const found: { word: string; offset: number }[] = [];
  const pattern = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;
  let match = pattern.exec(text);

  while (match !== null) {
    found.push({ word: match[0], offset: match.index });
    match = pattern.exec(text);
  }

  return found;
};

const mixedAlphabet = (text: string): GrammarIssue[] =>
  words(text)
    .filter(({ word }) => CYRILLIC.test(word) && LATIN.test(word))
    .map(({ word, offset }) => {
      const repaired = [...word]
        .map((character) => CONFUSABLE_TO_CYRILLIC[character] ?? character)
        .join("");

      return issue(
        "mixed-alphabet",
        "error",
        offset,
        word,
        "В русском слове латинские буквы: такую запись не найдёт поиск по карточкам.",
        LATIN.test(repaired) ? null : repaired,
      );
    });

const repeatedWords = (text: string): GrammarIssue[] => {
  const found: GrammarIssue[] = [];
  const list = words(text);

  for (let index = 1; index < list.length; index += 1) {
    const previous = list[index - 1]!;
    const current = list[index]!;
    const between = text.slice(
      previous.offset + previous.word.length,
      current.offset,
    );

    if (
      current.word.length >= MIN_REPEATED_WORD_LENGTH &&
      /^\s+$/u.test(between) &&
      previous.word.toLowerCase() === current.word.toLowerCase()
    ) {
      const fragment = text.slice(
        previous.offset,
        current.offset + current.word.length,
      );

      found.push(
        issue(
          "repeated-word",
          "error",
          previous.offset,
          fragment,
          "Слово повторяется дважды подряд.",
          previous.word,
        ),
      );
    }
  }

  return found;
};

const matches = (
  text: string,
  pattern: RegExp,
  build: (match: RegExpExecArray) => GrammarIssue,
): GrammarIssue[] => {
  const found: GrammarIssue[] = [];
  let match = pattern.exec(text);

  while (match !== null) {
    found.push(build(match));
    match = pattern.exec(text);
  }

  return found;
};

const doubleSpaces = (text: string): GrammarIssue[] =>
  matches(text, / {2,}/gu, (match) =>
    issue(
      "double-space",
      "style",
      match.index,
      match[0],
      "Лишние пробелы подряд.",
      " ",
    ),
  );

const spaceBeforePunctuation = (text: string): GrammarIssue[] =>
  matches(text, / +([,.;:!?])/gu, (match) =>
    issue(
      "space-before-punctuation",
      "style",
      match.index,
      match[0],
      "Перед знаком препинания пробел не ставится.",
      match[1]!,
    ),
  );

/** «10:30» и «12,5» — время и дробное число, а не пропущенный пробел. */
const insideNumber = (text: string, index: number): boolean =>
  /\d/u.test(text.charAt(index - 1)) && /\d/u.test(text.charAt(index + 1));

/**
 * Пропущенный пробел после знака.
 *
 * Точка проверяется только перед заглавной буквой: «т.е.», «д.12» и «кв.3» —
 * обычная запись адреса, а не ошибка. Знак между цифрами пропускается: время
 * и дробные числа диспетчер пишет постоянно.
 */
const missingSpaceAfterPunctuation = (text: string): GrammarIssue[] => [
  ...matches(text, /([,;:])(?=[\p{L}\p{N}])/gu, (match) =>
    issue(
      "missing-space-after-punctuation",
      "style",
      match.index,
      match[0],
      "После знака препинания нужен пробел.",
      `${match[1]!} `,
    ),
  ).filter((found) => !insideNumber(text, found.offset)),
  ...matches(text, /([.!?])(?=\p{Lu})/gu, (match) =>
    issue(
      "missing-space-after-punctuation",
      "style",
      match.index,
      match[0],
      "После знака препинания нужен пробел.",
      `${match[1]!} `,
    ),
  ),
];

/**
 * Точка внутри сокращения: «т.е.», «и т.д.», «т.к.».
 *
 * Такая точка предложение не заканчивает, а слово после неё пишут со
 * строчной буквы совершенно законно.
 */
const closesAbbreviation = (text: string, index: number): boolean =>
  /\p{L}\.\p{L}\.\s*$/u.test(text.slice(0, index));

const lowercaseSentenceStart = (text: string): GrammarIssue[] => {
  const found: GrammarIssue[] = [];
  const first = /\p{L}/u.exec(text);

  if (first !== null && /\p{Ll}/u.test(first[0])) {
    found.push(
      issue(
        "lowercase-sentence-start",
        "style",
        first.index,
        first[0],
        "Запись начинается со строчной буквы.",
        first[0].toUpperCase(),
      ),
    );
  }

  return [
    ...found,
    ...matches(text, /[.!?]\s+(\p{Ll})/gu, (match) =>
      issue(
        "lowercase-sentence-start",
        "style",
        match.index + match[0].length - 1,
        match[1]!,
        "Предложение начинается со строчной буквы.",
        match[1]!.toUpperCase(),
      ),
    ).filter((found) => !closesAbbreviation(text, found.offset)),
  ];
};

/**
 * Текст набран заглавными.
 *
 * Крик отличается от перечисления служб числом длинных слов: «МЧС, ДПС, СМП»
 * — обычная запись, а «ГОРИТ КРЫША» — крик. Поэтому считаются не буквы, а
 * слова, которые длиннее любого сокращения.
 */
const capsLock = (text: string): GrammarIssue[] => {
  if (/\p{Ll}/u.test(text)) {
    return [];
  }

  const written = words(text).filter(
    ({ word }) =>
      word.length >= MIN_CAPS_LOCK_WORD_LENGTH && /\p{Lu}/u.test(word),
  );

  if (written.length < MIN_CAPS_LOCK_WORDS) {
    return [];
  }

  return [
    issue(
      "caps-lock",
      "style",
      0,
      text,
      "Текст набран заглавными буквами.",
      text.charAt(0) + text.slice(1).toLowerCase(),
    ),
  ];
};

const digitLetterGlue = (text: string): GrammarIssue[] =>
  matches(
    text,
    new RegExp(`\\d(\\p{L}{${MIN_GLUED_WORD_LENGTH},})`, "gu"),
    (match) =>
      issue(
        "digit-letter-glue",
        "style",
        match.index,
        match[0],
        "Число слиплось со словом.",
        `${match[0].charAt(0)} ${match[1]!}`,
      ),
  );

const PAIRS: readonly (readonly [string, string])[] = [
  ["(", ")"],
  ["[", "]"],
  ["«", "»"],
];

const unbalanced = (text: string): GrammarIssue[] => {
  const found: GrammarIssue[] = [];

  for (const [open, close] of PAIRS) {
    const opened = [...text].filter((character) => character === open).length;
    const closed = [...text].filter((character) => character === close).length;

    if (opened !== closed) {
      const kind = open === "«" ? "unbalanced-quote" : "unbalanced-bracket";
      const missing = opened > closed ? close : open;
      const position = text.indexOf(opened > closed ? open : close);

      found.push(
        issue(
          kind,
          "style",
          position < 0 ? 0 : position,
          opened > closed ? open : close,
          `Не хватает парного знака «${missing}».`,
        ),
      );
    }
  }

  const straightQuotes = [...text].filter(
    (character) => character === '"',
  ).length;

  if (straightQuotes % 2 === 1) {
    found.push(
      issue(
        "unbalanced-quote",
        "style",
        text.indexOf('"'),
        '"',
        "Кавычка осталась без пары.",
      ),
    );
  }

  return found;
};

const repeatedPunctuation = (text: string): GrammarIssue[] =>
  matches(text, /([!?])\1+|[!?]{2,}|\.{4,}/gu, (match) =>
    issue(
      "repeated-punctuation",
      "style",
      match.index,
      match[0],
      "Несколько знаков препинания подряд.",
      match[0].startsWith(".") ? "…" : match[0].charAt(0),
    ),
  );

/** Правила, которые применимы к любому полю, даже к «улице» и «фамилии». */
const TERSE_RULES = [
  mixedAlphabet,
  repeatedWords,
  doubleSpaces,
  spaceBeforePunctuation,
  digitLetterGlue,
  unbalanced,
];

/** Дополнительно к ним — то, что осмысленно только для связного текста. */
const PROSE_RULES = [
  missingSpaceAfterPunctuation,
  lowercaseSentenceStart,
  capsLock,
  repeatedPunctuation,
];

/**
 * Находит замечания к тексту.
 *
 * Пустое значение замечаний не даёт: незаполненное поле — это вопрос к полноте
 * карточки, а не к грамотности, и его считает оценка, а не эта проверка.
 */
export const checkGrammar = (
  value: string,
  style: GrammarTextStyle = "prose",
): readonly GrammarIssue[] => {
  if (value.trim().length === 0) {
    return [];
  }

  const rules =
    style === "prose" ? [...TERSE_RULES, ...PROSE_RULES] : TERSE_RULES;

  return rules
    .flatMap((rule) => rule(value))
    .sort(
      (left, right) =>
        left.offset - right.offset || left.kind.localeCompare(right.kind),
    );
};
