import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const ScenarioAudioStatusSchema = z
  .object({
    scenarioVersionId: z.uuid(),
    status: z.enum(["not_prepared", "queued", "preparing", "ready", "failed"]),
    completed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    workerEnabled: z.boolean(),
  })
  .strict();

export class ScenarioAudioStatusDto extends createZodDto(
  ScenarioAudioStatusSchema,
) {}
