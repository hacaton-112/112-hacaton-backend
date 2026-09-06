import { z } from "zod";

import {
  AiIdentifierSchema,
  DialogueGenerationResultSchema,
  GenerateCallerReplyRequestSchema,
} from "./generation.contracts";
import {
  AudioChunkSchema,
  SpeechSynthesisMetricsSchema,
} from "./speech.contracts";

export const VoicePipelineRequestSchema = z
  .object({
    generation: GenerateCallerReplyRequestSchema,
    voiceId: AiIdentifierSchema,
  })
  .strict();

export const VoicePipelineGenerationMetricsSchema =
  DialogueGenerationResultSchema.pick({
    source: true,
    attempts: true,
  }).strict();

export const VoicePipelineMetricsSchema = z
  .object({
    timeToReplyMs: z.number().nonnegative(),
    timeToFirstAudioMs: z.number().nonnegative(),
    durationMs: z.number().nonnegative(),
    generation: VoicePipelineGenerationMetricsSchema,
    synthesis: SpeechSynthesisMetricsSchema,
  })
  .strict()
  .superRefine((metrics, context) => {
    if (metrics.timeToFirstAudioMs < metrics.timeToReplyMs) {
      context.addIssue({
        code: "custom",
        path: ["timeToFirstAudioMs"],
        message: "Time to first audio must not precede the validated reply",
      });
    }

    if (metrics.durationMs < metrics.timeToFirstAudioMs) {
      context.addIssue({
        code: "custom",
        path: ["durationMs"],
        message:
          "Pipeline duration must not be shorter than time to first audio",
      });
    }

    if (metrics.timeToFirstAudioMs < metrics.synthesis.timeToFirstAudioMs) {
      context.addIssue({
        code: "custom",
        path: ["timeToFirstAudioMs"],
        message:
          "Pipeline time to first audio must include synthesis time to first audio",
      });
    }

    if (metrics.durationMs < metrics.synthesis.durationMs) {
      context.addIssue({
        code: "custom",
        path: ["durationMs"],
        message: "Pipeline duration must include synthesis duration",
      });
    }
  });

export const VoicePipelineStreamEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("voice.reply.ready"),
      result: DialogueGenerationResultSchema,
      timeToReplyMs: z.number().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal("voice.audio.chunk"),
      chunk: AudioChunkSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("voice.completed"),
      metrics: VoicePipelineMetricsSchema,
    })
    .strict(),
]);

export type VoicePipelineRequest = z.infer<typeof VoicePipelineRequestSchema>;
export type VoicePipelineGenerationMetrics = z.infer<
  typeof VoicePipelineGenerationMetricsSchema
>;
export type VoicePipelineMetrics = z.infer<typeof VoicePipelineMetricsSchema>;
export type VoicePipelineStreamEvent = z.infer<
  typeof VoicePipelineStreamEventSchema
>;
