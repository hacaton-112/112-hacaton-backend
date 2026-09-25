import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { SCENARIO_GENERATION_STATUSES } from "@/drizzle/schema";

import {
  GenerateScenarioDraftRequestSchema,
  GenerateScenarioDraftResponseSchema,
} from "./scenario-authoring.dto";

export class CreateScenarioGenerationJobDto extends createZodDto(
  GenerateScenarioDraftRequestSchema,
) {}

/** Задание на черновик: статус для таблицы и готовый черновик, когда он есть. */
export const ScenarioGenerationJobSchema = z
  .object({
    id: z.string().min(1),
    brief: z.string(),
    status: z.enum(SCENARIO_GENERATION_STATUSES),
    /** Место в общей очереди, начиная с 1; только у ожидающих заданий. */
    queuePosition: z.number().int().min(1).nullable(),
    createdAt: z.iso.datetime(),
    startedAt: z.iso.datetime().nullable(),
    finishedAt: z.iso.datetime().nullable(),
    error: z.object({ code: z.string(), message: z.string() }).nullable(),
    /** В списке не передаётся: черновик большой, а таблице нужен только статус. */
    result: GenerateScenarioDraftResponseSchema.nullable(),
  })
  .strict();

export class ScenarioGenerationJobDto extends createZodDto(
  ScenarioGenerationJobSchema,
) {}

export const ScenarioGenerationJobListSchema = z
  .object({ jobs: z.array(ScenarioGenerationJobSchema) })
  .strict();

export class ScenarioGenerationJobListDto extends createZodDto(
  ScenarioGenerationJobListSchema,
) {}

export type ScenarioGenerationJob = z.infer<typeof ScenarioGenerationJobSchema>;
