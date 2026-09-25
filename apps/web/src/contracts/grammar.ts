import { z } from "zod";

/**
 * Замечания к тексту, который набрал человек.
 *
 * Одну форму отдают разбор звонка и проверка сценария: интерфейс подсвечивает
 * место по смещению, а поле `id` совпадает с путём поля в карточке или в
 * сценарии.
 */
export const GrammarIssueSchema = z.object({
  kind: z.string(),
  severity: z.enum(["error", "style"]),
  offset: z.number().int(),
  length: z.number().int(),
  fragment: z.string(),
  message: z.string(),
  suggestion: z.string().nullable(),
});

export const GrammarFieldReportSchema = z.object({
  id: z.string(),
  label: z.string(),
  issues: z.array(GrammarIssueSchema),
  errorCount: z.number().int(),
  styleCount: z.number().int(),
});

export const GrammarReportSchema = z.object({
  fields: z.array(GrammarFieldReportSchema),
  errorCount: z.number().int(),
  styleCount: z.number().int(),
  /** Правила работают всегда, модель — только по запросу и если доступна. */
  reviewedByModel: z.boolean(),
});

export type GrammarIssue = z.infer<typeof GrammarIssueSchema>;
export type GrammarFieldReport = z.infer<typeof GrammarFieldReportSchema>;
export type GrammarReport = z.infer<typeof GrammarReportSchema>;
