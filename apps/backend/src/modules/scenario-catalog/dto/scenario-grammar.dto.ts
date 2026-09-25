import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { GrammarReportSchema } from "@/contracts";

/**
 * Запрос на проверку грамотности сценария.
 *
 * Сценарий принимается как есть, без схемы: преподаватель просит проверку
 * после ручной правки, когда черновик ещё может не сходиться. Проверка читает
 * только текстовые поля и ничего не сохраняет.
 */
export const CheckScenarioGrammarRequestSchema = z
  .object({
    scenario: z.unknown(),
    /** Позвать ли модель после правил; по умолчанию правила работают одни. */
    deepReview: z.boolean().optional(),
  })
  .strict();

export class CheckScenarioGrammarRequestDto extends createZodDto(
  CheckScenarioGrammarRequestSchema,
) {}

export class ScenarioGrammarReportDto extends createZodDto(
  GrammarReportSchema,
) {}
