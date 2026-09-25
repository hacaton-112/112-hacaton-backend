import { z } from "zod";

/**
 * Настройка углублённой проверки текста моделью.
 *
 * Значение разбирается схемой, а не сравнивается со строкой: `1`, `True` или
 * опечатка роняют запуск с понятной ошибкой вместо того, чтобы тихо оставить
 * проверку выключенной.
 */
const GrammarConfigSchema = z.object({
  GRAMMAR_MODEL_REVIEW_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type GrammarEnvironment = z.input<typeof GrammarConfigSchema>;

export interface GrammarConfig {
  /** Правила работают всегда; модель — только когда её разрешили. */
  readonly modelReviewEnabled: boolean;
}

export const parseGrammarConfig = (
  environment: Partial<Record<keyof GrammarEnvironment, unknown>>,
): GrammarConfig => ({
  modelReviewEnabled: GrammarConfigSchema.parse(environment)
    .GRAMMAR_MODEL_REVIEW_ENABLED,
});
