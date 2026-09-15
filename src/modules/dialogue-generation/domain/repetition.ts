/** Слова короче трёх букв ничего не говорят о содержании реплики. */
const CONTENT_WORD_MIN_LENGTH = 3;
/** Ниже этой доли общих слов реплики считаются разными. */
const REPETITION_THRESHOLD = 0.7;
/** На двух общих словах совпадение — случайность, а не повтор. */
const MIN_SHARED_WORDS = 3;
/** Фраза считается сказанной, если почти все её слова уже звучали в одной фразе. */
const SENTENCE_REPEAT_THRESHOLD = 0.75;
/** Сколько последних реплик заявителя сверяется с новой. */
export const RECENT_CALLER_REPLIES = 3;
/**
 * Основа слова: у длинных слов окончание отбрасывается, чтобы «дышит» и
 * «дышал», «квартира» и «квартире» совпадали. Грубо, но повтор модель
 * произносит почти дословно, и точнее здесь не нужно.
 */
const STEM_LENGTH = 5;

const contentWords = (text: string): ReadonlySet<string> =>
  new Set(
    text
      .toLowerCase()
      .replaceAll("ё", "е")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/u)
      .filter((word) => word.length >= CONTENT_WORD_MIN_LENGTH),
  );

const contentStems = (text: string): ReadonlySet<string> =>
  new Set([...contentWords(text)].map((word) => word.slice(0, STEM_LENGTH)));

const sharedCount = (
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): number => [...left].filter((item) => right.has(item)).length;

/**
 * Пересказывает ли реплика предыдущую.
 *
 * Считается доля общих слов от более короткой реплики, а не от их объединения:
 * заявитель повторяет сказанное, добавляя пару слов, и «Хорошо, жду. Дети в
 * комнате, дверь горит!» после «Дети в комнате! Дверь горит!» — это тот же
 * ответ, а не новый.
 */
export const isNearRepetition = (text: string, previous: string): boolean => {
  const words = contentWords(text);
  const previousWords = contentWords(previous);

  if (words.size === 0 || previousWords.size === 0) {
    return false;
  }

  const shared = sharedCount(words, previousWords);

  return (
    shared >= MIN_SHARED_WORDS &&
    shared / Math.min(words.size, previousWords.size) >= REPETITION_THRESHOLD
  );
};

/** Предложения реплики вместе с их знаками препинания. */
export const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?…])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

/**
 * Несёт ли фраза сведение, разрешённое на этом ходу.
 *
 * Такую фразу убирать нельзя, даже если она звучала раньше: оператор мог
 * переспросить, и ответ на его вопрос важнее того, что он его уже слышал.
 */
const carriesAllowedFact = (
  sentence: ReadonlySet<string>,
  allowedFactValues: readonly ReadonlySet<string>[],
): boolean =>
  allowedFactValues.some((fact) => {
    const shared = sharedCount(sentence, fact);

    return shared >= 2 || (sentence.size === 1 && shared === 1);
  });

export interface RepeatedSentencesInput {
  readonly text: string;
  /** Последние реплики заявителя, самые свежие в конце. */
  readonly recentCallerReplies: readonly string[];
  /** Сведения, которые заявитель вправе назвать на этом ходу. */
  readonly allowedFactValues: readonly string[];
}

/**
 * Убирает из реплики фразы, которые заявитель уже говорил.
 *
 * Модель заканчивает реплику самым драматичным сведением звонка — «Дети там,
 * быстрее приезжайте!» — и делает это ход за ходом, а проверка всей реплики на
 * пересказ такой хвост не видит: новое начало делает реплику непохожей.
 * Живой человек так не говорит, поэтому повторённая фраза снимается целиком.
 *
 * Правило намеренно осторожное: фраза с разрешённым на этом ходу сведением
 * остаётся, а реплика, в которой не осталось бы ничего, возвращается как есть —
 * замолчать хуже, чем повториться.
 */
export const removeRepeatedSentences = ({
  text,
  recentCallerReplies,
  allowedFactValues,
}: RepeatedSentencesInput): string => {
  const earlier = recentCallerReplies
    .slice(-RECENT_CALLER_REPLIES)
    .flatMap(splitSentences)
    .map(contentStems)
    .filter((sentence) => sentence.size > 0);

  if (earlier.length === 0) {
    return text;
  }

  const facts = allowedFactValues.map(contentStems);
  const sentences = splitSentences(text);
  const kept = sentences.filter((sentence) => {
    const stems = contentStems(sentence);

    if (stems.size === 0 || carriesAllowedFact(stems, facts)) {
      return true;
    }

    return !earlier.some(
      (previous) =>
        sharedCount(stems, previous) / stems.size >= SENTENCE_REPEAT_THRESHOLD,
    );
  });

  return kept.length === 0 || kept.length === sentences.length
    ? text
    : kept.join(" ");
};
