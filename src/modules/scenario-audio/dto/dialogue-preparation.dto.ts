import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import {
  DialogueEntriesSchema,
  DialoguePreparationSchema,
} from "@/contracts/dialogue-preparation";
import { ScenarioSeedSchema } from "@/modules/scenario-engine/domain/scenario-seed.schema";

export class CreatePreparationDto extends createZodDto(
  z
    .object({
      scenario: ScenarioSeedSchema,
      useAi: z.boolean().default(false),
      authoringSource: z.enum(["manual", "assistant"]).default("manual"),
      authoringPrompt: z.string().trim().min(20).max(4000).optional(),
    })
    .strict()
    .refine(
      (input) =>
        input.authoringSource !== "assistant" || Boolean(input.authoringPrompt),
      { message: "Retain the assistant authoring prompt" },
    ),
) {}
export class ReviewPreparationDto extends createZodDto(
  z
    .object({
      revision: z.number().int().positive(),
      entries: DialogueEntriesSchema,
    })
    .strict(),
) {}
export class PreparationRevisionDto extends createZodDto(
  z.object({ revision: z.number().int().positive() }).strict(),
) {}
export class DialoguePreparationDto extends createZodDto(
  DialoguePreparationSchema,
) {}
