import { z } from "zod";

/**
 * Параметры правила эскалации. Хранятся в jsonb, потому что у разных триггеров
 * разная форма, и проверяются схемой при загрузке сценария: правило с мусором
 * должно валить старт звонка, а не молча не срабатывать.
 */
export const EscalationParamsSchema = z
  .object({
    keywords: z.array(z.string().trim().min(2)).max(32).optional(),
    seconds: z.number().int().min(1).max(600).optional(),
    fraction: z.number().min(0).max(1).optional(),
    times: z.number().int().min(1).max(20).optional(),
  })
  .strict();

export type EscalationParams = z.infer<typeof EscalationParamsSchema>;
