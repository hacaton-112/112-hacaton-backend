import { z } from "zod";

/**
 * Замечания к тексту, который набрал человек.
 *
 * Контракт, а не DTO одного маршрута: одну и ту же форму понимают отчёт о
 * занятии, проверка сценария перед публикацией и настольное приложение.
 * Сегодня клиент печатает фрагмент строкой; смещение отдаётся на будущее,
 * когда замечание будет подсвечиваться прямо в поле.
 */
export const GRAMMAR_ISSUE_KINDS = [
  /** Латиница внутри русского слова: «пoжар» с латинской «o». */
  "mixed-alphabet",
  /** Слово повторено подряд: «на на улице». */
  "repeated-word",
  "double-space",
  "space-before-punctuation",
  "missing-space-after-punctuation",
  /** Предложение начинается со строчной буквы. */
  "lowercase-sentence-start",
  /** Текст набран заглавными. */
  "caps-lock",
  /** Цифра слиплась со словом: «5этаж». */
  "digit-letter-glue",
  "unbalanced-bracket",
  "unbalanced-quote",
  /** Подряд несколько знаков: «!!!». */
  "repeated-punctuation",
  /** Нашла модель при углублённой проверке. */
  "model-review",
] as const;

export const GRAMMAR_SEVERITIES = ["error", "style"] as const;

export const GrammarIssueSchema = z
  .object({
    kind: z.enum(GRAMMAR_ISSUE_KINDS),
    severity: z.enum(GRAMMAR_SEVERITIES),
    /** Смещение фрагмента от начала текста в кодовых единицах UTF-16. */
    offset: z.number().int().nonnegative(),
    length: z.number().int().nonnegative(),
    fragment: z.string(),
    message: z.string(),
    suggestion: z.string().nullable(),
  })
  .strict();

export const GrammarFieldReportSchema = z
  .object({
    /** Идентификатор поля карточки или путь до поля сценария. */
    id: z.string(),
    label: z.string(),
    issues: z.array(GrammarIssueSchema),
    errorCount: z.number().int().nonnegative(),
    styleCount: z.number().int().nonnegative(),
  })
  .strict();

export const GrammarReportSchema = z
  .object({
    fields: z.array(GrammarFieldReportSchema),
    errorCount: z.number().int().nonnegative(),
    styleCount: z.number().int().nonnegative(),
    /** Правила работают всегда, модель — только по запросу и если доступна. */
    reviewedByModel: z.boolean(),
  })
  .strict();

export type GrammarIssueContract = z.infer<typeof GrammarIssueSchema>;
export type GrammarReportContract = z.infer<typeof GrammarReportSchema>;
