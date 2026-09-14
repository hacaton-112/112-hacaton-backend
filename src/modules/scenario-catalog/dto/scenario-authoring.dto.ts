import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { ScenarioSeedSchema } from "@/modules/scenario-engine/domain/scenario-seed.schema";

import { ScenarioAssistantDraftSchema } from "../domain/scenario-assistant-suggestion";

export const GenerateScenarioDraftRequestSchema = z
  .object({
    brief: z.string().trim().min(20).max(4_000),
  })
  .strict();

export class GenerateScenarioDraftRequestDto extends createZodDto(
  GenerateScenarioDraftRequestSchema,
) {}

export const GenerateScenarioDraftResponseSchema = z
  .object({
    scenario: ScenarioAssistantDraftSchema,
    authoringPrompt: z.string().min(20).max(4_000),
  })
  .strict();

export class GenerateScenarioDraftResponseDto extends createZodDto(
  GenerateScenarioDraftResponseSchema,
) {}

export type GenerateScenarioDraftResponse = z.infer<
  typeof GenerateScenarioDraftResponseSchema
>;

export const PublishScenarioRequestSchema = z
  .object({
    scenario: ScenarioSeedSchema,
    authoringSource: z.enum(["manual", "assistant"]),
    authoringPrompt: z.string().trim().min(20).max(4_000).optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (
      request.authoringSource === "assistant" &&
      request.authoringPrompt === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["authoringPrompt"],
        message: "AI-assisted publication must retain its authoring prompt",
      });
    }
  });

export class PublishScenarioRequestDto extends createZodDto(
  PublishScenarioRequestSchema,
) {}

export const PublishedScenarioSchema = z
  .object({
    scenarioId: z.string().min(1),
    scenarioVersionId: z.string().min(1),
    code: z.string().min(2).max(32),
    title: z.string().min(3).max(120),
    version: z.number().int().positive(),
    status: z.literal("published"),
    publishedAt: z.iso.datetime(),
  })
  .strict();

export class PublishedScenarioDto extends createZodDto(
  PublishedScenarioSchema,
) {}

export type PublishScenarioRequest = z.infer<
  typeof PublishScenarioRequestSchema
>;
