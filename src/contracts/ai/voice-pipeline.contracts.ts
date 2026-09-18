import { z } from "zod";

import {
  AiIdentifierSchema,
  CallerReactionActSchema,
  DialogueGenerationResultSchema,
  DialogueGenerationMetricsSchema,
  GenerateCallerReplyRequestSchema,
  MinimumResponseDelayMsSchema,
} from "./generation.contracts";
import {
  AudioChunkSchema,
  SpeechSynthesisMetricsSchema,
  TtsLanguageSchema,
  TtsSynthesisRequestSchema,
} from "./speech.contracts";

/**
 * Как реплика должна звучать. Решает это сценарий, а не модель: ступень паники
 * задаёт силу и темп речи, персонаж — голос и пол. Модель пишет слова.
 */
export const VoicePipelineVoiceSchema = TtsSynthesisRequestSchema.pick({
  voiceId: true,
  gender: true,
  emotion: true,
  intensity: true,
  speechRate: true,
}).strict();

export const VoicePipelineRequestSchema = z
  .object({
    generation: GenerateCallerReplyRequestSchema,
    voice: VoicePipelineVoiceSchema,
    /** Internal factory decision, never supplied by a websocket client. */
    preferPreparedReply: z.boolean().optional(),
  })
  .strict();

/** Заданная сценарием реплика, которой не нужна переформулировка через LLM. */
export const PrescribedSpeechRequestSchema = z
  .object({
    requestId: AiIdentifierSchema,
    sessionId: AiIdentifierSchema,
    text: TtsSynthesisRequestSchema.shape.text,
    language: TtsLanguageSchema,
    voice: VoicePipelineVoiceSchema,
    minimumResponseDelayMs: MinimumResponseDelayMsSchema,
  })
  .strict();

export const VoicePipelineTurnTakingMetricsSchema = z
  .object({
    reactionAct: CallerReactionActSchema,
    minimumResponseDelayMs: MinimumResponseDelayMsSchema,
    /** ASR и подготовка Scenario Engine уже могли израсходовать эту паузу. */
    elapsedBeforePipelineMs: z.number().nonnegative(),
    appliedDelayMs: z.number().nonnegative(),
  })
  .strict();

export const PrescribedSpeechMetricsSchema = z
  .object({
    kind: z.literal("prescribed"),
    minimumResponseDelayMs: MinimumResponseDelayMsSchema,
    timeToFirstAudioMs: z.number().nonnegative(),
    durationMs: z.number().nonnegative(),
    synthesis: SpeechSynthesisMetricsSchema,
  })
  .strict()
  .superRefine((metrics, context) => {
    if (metrics.timeToFirstAudioMs < metrics.minimumResponseDelayMs) {
      context.addIssue({
        code: "custom",
        path: ["timeToFirstAudioMs"],
        message: "Prescribed speech started before its minimum response delay",
      });
    }

    if (metrics.durationMs < metrics.timeToFirstAudioMs) {
      context.addIssue({
        code: "custom",
        path: ["durationMs"],
        message: "Duration must not be shorter than time to first audio",
      });
    }

    if (metrics.timeToFirstAudioMs < metrics.synthesis.timeToFirstAudioMs) {
      context.addIssue({
        code: "custom",
        path: ["timeToFirstAudioMs"],
        message: "Response timing must include synthesis time to first audio",
      });
    }

    if (metrics.durationMs < metrics.synthesis.durationMs) {
      context.addIssue({
        code: "custom",
        path: ["durationMs"],
        message: "Response duration must include synthesis duration",
      });
    }
  });

export const VoicePipelineGenerationMetricsSchema =
  DialogueGenerationMetricsSchema;

export const VoicePipelineMetricsSchema = z
  .object({
    timeToReplyMs: z.number().nonnegative(),
    timeToFirstAudioMs: z.number().nonnegative(),
    durationMs: z.number().nonnegative(),
    generation: VoicePipelineGenerationMetricsSchema,
    synthesis: SpeechSynthesisMetricsSchema,
    turnTaking: VoicePipelineTurnTakingMetricsSchema.optional(),
  })
  .strict()
  .superRefine((metrics, context) => {
    if (
      metrics.turnTaking !== undefined &&
      metrics.timeToFirstAudioMs + metrics.turnTaking.elapsedBeforePipelineMs <
        metrics.turnTaking.minimumResponseDelayMs
    ) {
      context.addIssue({
        code: "custom",
        path: ["timeToFirstAudioMs"],
        message: "Caller audio started before its minimum response delay",
      });
    }

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

export type VoicePipelineVoice = z.infer<typeof VoicePipelineVoiceSchema>;
export type VoicePipelineRequest = z.infer<typeof VoicePipelineRequestSchema>;
export type PrescribedSpeechRequest = z.infer<
  typeof PrescribedSpeechRequestSchema
>;
export type PrescribedSpeechMetrics = z.infer<
  typeof PrescribedSpeechMetricsSchema
>;
export type VoicePipelineGenerationMetrics = z.infer<
  typeof VoicePipelineGenerationMetricsSchema
>;
export type VoicePipelineMetrics = z.infer<typeof VoicePipelineMetricsSchema>;
export type VoicePipelineStreamEvent = z.infer<
  typeof VoicePipelineStreamEventSchema
>;
