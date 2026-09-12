/** Слова короче трёх букв ничего не говорят о содержании реплики. */
const CONTENT_WORD_MIN_LENGTH = 3;
/** Ниже этой доли общих слов реплики считаются разными. */
const REPETITION_THRESHOLD = 0.7;
/** На двух общих словах совпадение — случайность, а не повтор. */
const MIN_SHARED_WORDS = 3;

const contentWords = (text: string): ReadonlySet<string> =>
  new Set(
    text
      .toLowerCase()
      .replaceAll("ё", "е")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/u)
      .filter((word) => word.length >= CONTENT_WORD_MIN_LENGTH),
  );

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

  let shared = 0;

  for (const word of words) {
    if (previousWords.has(word)) {
      shared += 1;
    }
  }

  return (
    shared >= MIN_SHARED_WORDS &&
    shared / Math.min(words.size, previousWords.size) >= REPETITION_THRESHOLD
  );
};
