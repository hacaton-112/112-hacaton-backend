import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { SCENARIO_CATEGORIES } from "@/drizzle/schema";

/**
 * Что оператор знает о сценарии до звонка.
 *
 * Ни фактов, ни эталонной анкеты здесь нет и быть не может: увидев ответы
 * заранее, обучаемый перестаёт их выяснять, а занятие теряет смысл.
 */
export const ScenarioSummarySchema = z
  .object({
    scenarioVersionId: z.string().min(1),
    code: z.string().min(1).max(32),
    title: z.string().min(1).max(120),
    summary: z.string().max(2_000),
    category: z.enum(SCENARIO_CATEGORIES),
    difficulty: z.number().int().min(1).max(5),
    answerNormSeconds: z.number().int().positive(),
    /** Сколько по замыслу автора длится разговор: карточка каталога. */
    expectedDurationSeconds: z.number().int().positive(),
    version: z.number().int().positive(),
  })
  .strict();

export const ScenarioListSchema = z
  .object({ scenarios: z.array(ScenarioSummarySchema) })
  .strict();

export class ScenarioListDto extends createZodDto(ScenarioListSchema) {}

export type ScenarioSummary = z.infer<typeof ScenarioSummarySchema>;
export type ScenarioList = z.infer<typeof ScenarioListSchema>;
