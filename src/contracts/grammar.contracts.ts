import { z } from "zod";

/**
 * Замечания к тексту, который набрал человек.
 *
 * Контракт, а не DTO одного маршрута: одну и ту же форму понимают отчёт о
 * занятии, проверка сценария перед публикацией и настольное приложение,
 * которое подсвечивает место ошибки.
 */
export const GRAMMAR_ISSUE_KINDS = [
  "mixed-alphabet",
  "repeated-word",
  "double-space",
  "space-before-punctuation",
  "missing-space-after-punctuation",
  "lowercase-sentence-start",
  "caps-lock",
  "digit-letter-glue",
  "unbalanced-bracket",
  "unbalanced-quote",
  "repeated-punctuation",
  "model-review",
] as const;

export const GRAMMAR_SEVERITIES = ["error", "style"] as const;

export const GrammarIssueSchema = z
  .object({
    kind: z.enum(GRAMMAR_ISSUE_KINDS),
    severity: z.enum(GRAMMAR_SEVERITIES),
    /** Смещение фрагмента в символах: по нему подсвечивается место. */
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
