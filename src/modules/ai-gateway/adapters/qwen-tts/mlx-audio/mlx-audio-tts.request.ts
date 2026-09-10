import { z } from "zod";

import {
  AiIdentifierSchema,
  CallerGenderSchema,
  CallerReplyTextSchema,
  SpeechRateSchema,
  TtsSynthesisRequestSchema,
  type TtsSynthesisRequest,
} from "@/contracts";

import {
  MAX_QWEN_TTS_STREAMING_INTERVAL_SECONDS,
  MIN_QWEN_TTS_STREAMING_INTERVAL_SECONDS,
  type MlxAudioTtsConfig,
} from "../qwen-tts.config";
import { buildQwenTtsInstruction } from "../qwen-tts.instruction";
import { resolveQwenTtsReferenceVoice } from "../qwen-tts.reference-voices";

export const MLX_AUDIO_TTS_MAX_TOKENS = 1_200;

const MlxAudioCommonSpeechRequestSchema = z
  .object({
    model: z.string().trim().min(1).max(256),
    input: CallerReplyTextSchema,
    speed: SpeechRateSchema,
    lang_code: z.literal("Russian"),
    instruct: z.string().trim().min(1).max(512),
    response_format: z.literal("pcm"),
    stream: z.literal(true),
    streaming_interval: z
      .number()
      .min(MIN_QWEN_TTS_STREAMING_INTERVAL_SECONDS)
      .max(MAX_QWEN_TTS_STREAMING_INTERVAL_SECONDS),
    max_tokens: z.literal(MLX_AUDIO_TTS_MAX_TOKENS),
    verbose: z.literal(false),
  })
  .strict();

export const MlxAudioCustomVoiceSpeechRequestSchema =
  MlxAudioCommonSpeechRequestSchema.extend({
    voice: AiIdentifierSchema,
    // Провайдер выбирает голос по полу; имя голоса эта сборка может и не знать.
    gender: CallerGenderSchema,
  }).strict();

export const MlxAudioBaseIclSpeechRequestSchema =
  MlxAudioCommonSpeechRequestSchema.extend({
    ref_audio: z.string().min(1).max(1_024),
    ref_text: z.string().trim().min(3).max(2_000),
  }).strict();

export const MlxAudioTtsSpeechRequestSchema = z.union([
  MlxAudioCustomVoiceSpeechRequestSchema,
  MlxAudioBaseIclSpeechRequestSchema,
]);

export type MlxAudioTtsSpeechRequest = z.infer<
  typeof MlxAudioTtsSpeechRequestSchema
>;

export const buildMlxAudioTtsRequest = (
  rawRequest: TtsSynthesisRequest,
  config: MlxAudioTtsConfig,
): MlxAudioTtsSpeechRequest => {
  const request = TtsSynthesisRequestSchema.parse(rawRequest);
  const commonRequest = {
    model: config.model,
    input: request.text,
    speed: request.speechRate,
    lang_code: request.language,
    instruct: buildQwenTtsInstruction(request.emotion, request.intensity),
    response_format: "pcm" as const,
    stream: true as const,
    streaming_interval: config.streamingIntervalSeconds,
    max_tokens: MLX_AUDIO_TTS_MAX_TOKENS,
    verbose: false as const,
  };

  if (config.mode === "custom-voice") {
    return MlxAudioCustomVoiceSpeechRequestSchema.parse({
      model: config.model,
      input: request.text,
      voice: request.voiceId,
      gender: request.gender,
      speed: request.speechRate,
      lang_code: request.language,
      instruct: buildQwenTtsInstruction(request.emotion, request.intensity),
      response_format: "pcm",
      stream: true,
      streaming_interval: config.streamingIntervalSeconds,
      max_tokens: MLX_AUDIO_TTS_MAX_TOKENS,
      verbose: false,
    });
  }

  const reference = resolveQwenTtsReferenceVoice(
    config.referenceVoices,
    request.voiceId,
    request.gender,
  );

  return MlxAudioBaseIclSpeechRequestSchema.parse({
    ...commonRequest,
    ref_audio: reference.audioPath,
    ref_text: reference.refText,
  });
};
