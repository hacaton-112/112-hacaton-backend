/** Что модель нашла в одном из присланных текстов. */
export interface GrammarReviewFinding {
  /** Идентификатор текста из запроса: модель не придумывает свои. */
  readonly textId: string;
  /** Фрагмент дословно из текста — по нему находится место ошибки. */
  readonly fragment: string;
  readonly message: string;
  readonly suggestion: string | null;
}

export interface GrammarReviewInput {
  readonly id: string;
  readonly value: string;
}

/**
 * Углублённая проверка текста моделью.
 *
 * Отдельный порт, а не часть сервиса: правила работают всегда и без сети, а
 * модель — только когда преподаватель попросил и когда она вообще доступна.
 * Отчёт о занятии на неё не опирается, чтобы оставаться воспроизводимым.
 */
export interface GrammarReviewPort {
  review(
    texts: readonly GrammarReviewInput[],
    signal: AbortSignal,
  ): Promise<readonly GrammarReviewFinding[]>;
}

export const GRAMMAR_REVIEW_PORT = Symbol("GRAMMAR_REVIEW_PORT");
