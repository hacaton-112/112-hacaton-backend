import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { AUTHORING_SOURCES } from "@/drizzle/schema";
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

/** ИИ-черновик публикуется только вместе с текстом, из которого он родился. */
const requireAuthoringPrompt = (
  request: {
    authoringSource: "manual" | "assistant";
    authoringPrompt?: string;
  },
  context: z.RefinementCtx,
) => {
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
};

export const PublishScenarioRequestSchema = z
  .object({
    scenario: ScenarioSeedSchema,
    authoringSource: z.enum(["manual", "assistant"]),
    authoringPrompt: z.string().trim().min(20).max(4_000).optional(),
  })
  .strict()
  .superRefine(requireAuthoringPrompt);

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

export const PublishScenarioVersionRequestSchema = z
  .object({
    /** Версия, открытая в редакторе: если она уже не последняя, правка отклоняется. */
    baseVersionId: z.string().trim().min(1).max(64),
    scenario: ScenarioSeedSchema,
    authoringSource: z.enum(["manual", "assistant"]),
    authoringPrompt: z.string().trim().min(20).max(4_000).optional(),
  })
  .strict()
  .superRefine(requireAuthoringPrompt);

export class PublishScenarioVersionRequestDto extends createZodDto(
  PublishScenarioVersionRequestSchema,
) {}

export type PublishScenarioVersionRequest = z.infer<
  typeof PublishScenarioVersionRequestSchema
>;

export const EditableScenarioVersionSchema = z
  .object({
    scenarioId: z.string().min(1),
    scenarioVersionId: z.string().min(1),
    version: z.number().int().positive(),
    isLatest: z.boolean(),
    publishedAt: z.iso.datetime(),
    authoringSource: z.enum(AUTHORING_SOURCES),
    /**
     * Сценарий в форме публикации. Строгой схемой не проверяется: версия,
     * опубликованная по прошлым правилам, должна открываться, чтобы её можно
     * было исправить, — расхождения перечислены в `issues`.
     */
    scenario: z.record(z.string(), z.unknown()),
    issues: z.array(
      z
        .object({
          path: z.array(z.union([z.string(), z.number()])),
          message: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export class EditableScenarioVersionDto extends createZodDto(
  EditableScenarioVersionSchema,
) {}
