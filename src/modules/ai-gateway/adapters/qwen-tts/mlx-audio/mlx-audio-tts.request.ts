import { z } from "zod";

import {
  AiIdentifierSchema,
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

export const MLX_AUDIO_TTS_MAX_TOKENS = 1_200;

export const MlxAudioTtsSpeechRequestSchema = z
  .object({
    model: z.string().trim().min(1).max(256),
    input: CallerReplyTextSchema,
    voice: AiIdentifierSchema,
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

export type MlxAudioTtsSpeechRequest = z.infer<
  typeof MlxAudioTtsSpeechRequestSchema
>;

export const buildMlxAudioTtsRequest = (
  rawRequest: TtsSynthesisRequest,
  config: MlxAudioTtsConfig,
): MlxAudioTtsSpeechRequest => {
  const request = TtsSynthesisRequestSchema.parse(rawRequest);

  return MlxAudioTtsSpeechRequestSchema.parse({
    model: config.model,
    input: request.text,
    voice: request.voiceId,
    speed: request.speechRate,
    lang_code: request.language,
    instruct: buildQwenTtsInstruction(request.emotion, request.intensity),
    response_format: "pcm",
    stream: true,
    streaming_interval: config.streamingIntervalSeconds,
    max_tokens: MLX_AUDIO_TTS_MAX_TOKENS,
    verbose: false,
  });
};
