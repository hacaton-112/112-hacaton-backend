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

export type TtsLanguage = z.infer<typeof TtsLanguageSchema>;
export type AudioFormat = z.infer<typeof AudioFormatSchema>;
export type AudioSampleRate = z.infer<typeof AudioSampleRateSchema>;
export type TtsSynthesisRequest = z.infer<typeof TtsSynthesisRequestSchema>;
export type AudioChunkMetadata = z.infer<typeof AudioChunkMetadataSchema>;
export type AudioChunk = z.infer<typeof AudioChunkSchema>;
