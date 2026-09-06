import { z } from "zod";

import {
  AiIdentifierSchema,
  CallerEmotionSchema,
  CallerReplyTextSchema,
  EmotionIntensitySchema,
  SpeechRateSchema,
  TtsSynthesisRequestSchema,
  type CallerEmotion,
  type TtsSynthesisRequest,
} from "@/contracts";

import {
  MAX_QWEN_TTS_STREAMING_INTERVAL_SECONDS,
  MIN_QWEN_TTS_STREAMING_INTERVAL_SECONDS,
  type QwenTtsConfig,
} from "./qwen-tts.config";

export const QWEN_TTS_MAX_TOKENS = 1_200;

export const QwenTtsIntensityLevelSchema = z.enum([
  "слабая",
  "средняя",
  "сильная",
]);

const emotionInstructions = {
  neutral: "Говори нейтрально и естественно.",
  calm: "Говори спокойно и уверенно.",
  anxious: "Говори тревожно и взволнованно.",
  panic: "Говори в панике, сбивчиво и напряжённо.",
  pain: "Говори так, будто испытываешь боль.",
  anger: "Говори сердито и резко.",
  confusion: "Говори растерянно и неуверенно.",
} as const satisfies Record<CallerEmotion, string>;

export const QwenTtsSpeechRequestSchema = z
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
    max_tokens: z.literal(QWEN_TTS_MAX_TOKENS),
    verbose: z.literal(false),
  })
  .strict();

export type QwenTtsIntensityLevel = z.infer<typeof QwenTtsIntensityLevelSchema>;
export type QwenTtsSpeechRequest = z.infer<typeof QwenTtsSpeechRequestSchema>;

export const mapQwenTtsIntensity = (
  intensity: number,
): QwenTtsIntensityLevel => {
  const value = EmotionIntensitySchema.parse(intensity);

  if (value < 0.34) {
    return "слабая";
  }

  if (value < 0.67) {
    return "средняя";
  }

  return "сильная";
};

export const buildQwenTtsInstruction = (
  emotion: CallerEmotion,
  intensity: number,
): string => {
  const parsedEmotion = CallerEmotionSchema.parse(emotion);
  const intensityLevel = mapQwenTtsIntensity(intensity);

  return `${emotionInstructions[parsedEmotion]} Выраженность эмоции: ${intensityLevel}.`;
};

export const buildQwenTtsRequest = (
  rawRequest: TtsSynthesisRequest,
  config: QwenTtsConfig,
): QwenTtsSpeechRequest => {
  const request = TtsSynthesisRequestSchema.parse(rawRequest);

  return QwenTtsSpeechRequestSchema.parse({
    model: config.model,
    input: request.text,
    voice: request.voiceId,
    speed: request.speechRate,
    lang_code: request.language,
    instruct: buildQwenTtsInstruction(request.emotion, request.intensity),
    response_format: "pcm",
    stream: true,
    streaming_interval: config.streamingIntervalSeconds,
    max_tokens: QWEN_TTS_MAX_TOKENS,
    verbose: false,
  });
};
