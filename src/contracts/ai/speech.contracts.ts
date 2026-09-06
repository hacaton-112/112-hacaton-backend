import { z } from "zod";

import {
  AiIdentifierSchema,
  CallerEmotionSchema,
  CallerReplyTextSchema,
  EmotionIntensitySchema,
  SpeechRateSchema,
} from "./generation.contracts";

export const TtsLanguageSchema = z.literal("Russian");
export const AudioFormatSchema = z.literal("pcm_s16le");

export const AudioSampleRateSchema = z
  .number()
  .int()
  .min(8_000)
  .max(192_000);

export const TtsSynthesisRequestSchema = z
  .object({
    requestId: AiIdentifierSchema,
    sessionId: AiIdentifierSchema,
    text: CallerReplyTextSchema,
    language: TtsLanguageSchema,
    voiceId: AiIdentifierSchema,
    emotion: CallerEmotionSchema,
    intensity: EmotionIntensitySchema,
    speechRate: SpeechRateSchema,
  })
  .strict();

export const AudioChunkMetadataSchema = z
  .object({
    streamId: AiIdentifierSchema,
    sequence: z.number().int().nonnegative(),
    sampleRate: AudioSampleRateSchema,
    channels: z.literal(1),
    format: AudioFormatSchema,
    isFinal: z.boolean(),
  })
  .strict();

export const AudioChunkSchema = AudioChunkMetadataSchema.extend({
  audio: z.instanceof(Uint8Array).refine(
    (audio) => audio.byteLength > 0 && audio.byteLength % 2 === 0,
    "PCM S16LE audio must contain a positive, even number of bytes",
  ),
}).strict();

export const SpeechSynthesisAttemptOutcomeSchema = z.enum([
  "success",
  "invalid-stream",
  "provider-error",
]);

export const SpeechSynthesisAttemptMetricsSchema = z
  .object({
    attempt: z.number().int().min(1).max(2),
    durationMs: z.number().nonnegative(),
    outcome: SpeechSynthesisAttemptOutcomeSchema,
  })
  .strict();

export const SpeechSynthesisMetricsSchema = z
  .object({
    timeToFirstAudioMs: z.number().nonnegative(),
    durationMs: z.number().nonnegative(),
    chunkCount: z.number().int().positive(),
    audioBytes: z.number().int().positive().multipleOf(2),
    attempts: z.array(SpeechSynthesisAttemptMetricsSchema).min(1).max(2),
  })
  .strict()
  .superRefine((metrics, context) => {
    if (metrics.durationMs < metrics.timeToFirstAudioMs) {
      context.addIssue({
        code: "custom",
        path: ["durationMs"],
        message: "Duration must not be shorter than time to first audio",
      });
    }

    metrics.attempts.forEach((attempt, index) => {
      if (attempt.attempt !== index + 1) {
        context.addIssue({
          code: "custom",
          path: ["attempts", index, "attempt"],
          message: "Attempt numbers must be sequential",
        });
      }

      const isLastAttempt = index === metrics.attempts.length - 1;

      if (isLastAttempt && attempt.outcome !== "success") {
        context.addIssue({
          code: "custom",
          path: ["attempts", index, "outcome"],
          message: "The final completed attempt must be successful",
        });
      }

      if (!isLastAttempt && attempt.outcome === "success") {
        context.addIssue({
          code: "custom",
          path: ["attempts", index, "outcome"],
          message: "Only the final attempt can be successful",
        });
      }
    });
  });

export const SpeechSynthesisStreamEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("audio.chunk"),
      chunk: AudioChunkSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("synthesis.completed"),
      metrics: SpeechSynthesisMetricsSchema,
    })
    .strict(),
]);

export type TtsLanguage = z.infer<typeof TtsLanguageSchema>;
export type AudioFormat = z.infer<typeof AudioFormatSchema>;
export type AudioSampleRate = z.infer<typeof AudioSampleRateSchema>;
export type TtsSynthesisRequest = z.infer<typeof TtsSynthesisRequestSchema>;
export type AudioChunkMetadata = z.infer<typeof AudioChunkMetadataSchema>;
export type AudioChunk = z.infer<typeof AudioChunkSchema>;
export type SpeechSynthesisAttemptOutcome = z.infer<
  typeof SpeechSynthesisAttemptOutcomeSchema
>;
export type SpeechSynthesisAttemptMetrics = z.infer<
  typeof SpeechSynthesisAttemptMetricsSchema
>;
export type SpeechSynthesisMetrics = z.infer<
  typeof SpeechSynthesisMetricsSchema
>;
export type SpeechSynthesisStreamEvent = z.infer<
  typeof SpeechSynthesisStreamEventSchema
>;
