import { z } from "zod";

import {
  AiIdentifierSchema,
  CallerReplyTextSchema,
  findQwenTtsVoice,
  SpeechRateSchema,
  TtsSynthesisRequestSchema,
  type TtsSynthesisRequest,
} from "@/contracts";

import { QWEN_TTS_SAMPLE_RATE } from "../qwen-tts.config";
import { buildQwenTtsInstruction } from "../qwen-tts.instruction";
import type { VllmOmniTtsConfig } from "./vllm-omni-tts.config";

export const VLLM_OMNI_TTS_MAX_NEW_TOKENS = 1_200;

export const VllmOmniSpeechRateLevelSchema = z.enum([
  "медленный",
  "обычный",
  "быстрый",
]);

export const VllmOmniTtsSpeechRequestSchema = z
  .object({
    model: z.string().trim().min(1).max(256),
    input: CallerReplyTextSchema,
    voice: AiIdentifierSchema,
    task_type: z.literal("CustomVoice"),
    language: z.literal("Russian"),
    instructions: z.string().trim().min(1).max(768),
    response_format: z.literal("pcm"),
    sample_rate: z.literal(QWEN_TTS_SAMPLE_RATE),
    stream: z.literal(true),
    stream_format: z.literal("audio"),
    max_new_tokens: z.literal(VLLM_OMNI_TTS_MAX_NEW_TOKENS),
  })
  .strict();

export type VllmOmniSpeechRateLevel = z.infer<
  typeof VllmOmniSpeechRateLevelSchema
>;
export type VllmOmniTtsSpeechRequest = z.infer<
  typeof VllmOmniTtsSpeechRequestSchema
>;

export const normalizeVllmOmniVoice = (voiceId: string): string => {
  const voice = AiIdentifierSchema.parse(voiceId);

  // Каталог общий с автором сценария: там же записано, кому какой голос
  // принадлежит, и там же ловится несовпадение с полом заявителя.
  return findQwenTtsVoice(voice)?.id ?? voice;
};

export const mapVllmOmniSpeechRate = (
  speechRate: number,
): VllmOmniSpeechRateLevel => {
  const value = SpeechRateSchema.parse(speechRate);

  if (value < 0.85) {
    return "медленный";
  }

  if (value > 1.15) {
    return "быстрый";
  }

  return "обычный";
};

export const buildVllmOmniTtsInstruction = (
  request: TtsSynthesisRequest,
): string => {
  const rate = mapVllmOmniSpeechRate(request.speechRate);
  // Отдельного поля для пола у этого рантайма нет, поэтому он идёт словами.
  const voice = request.gender === "male" ? "мужской" : "женский";

  return (
    `${buildQwenTtsInstruction(request.emotion, request.intensity)} ` +
    `Голос: ${voice}. Темп речи: ${rate}.`
  );
};

export const buildVllmOmniTtsRequest = (
  rawRequest: TtsSynthesisRequest,
  config: VllmOmniTtsConfig,
): VllmOmniTtsSpeechRequest => {
  const request = TtsSynthesisRequestSchema.parse(rawRequest);

  return VllmOmniTtsSpeechRequestSchema.parse({
    model: config.model,
    input: request.text,
    voice: normalizeVllmOmniVoice(request.voiceId),
    task_type: "CustomVoice",
    language: request.language,
    instructions: buildVllmOmniTtsInstruction(request),
    response_format: "pcm",
    sample_rate: QWEN_TTS_SAMPLE_RATE,
    stream: true,
    stream_format: "audio",
    max_new_tokens: VLLM_OMNI_TTS_MAX_NEW_TOKENS,
  });
};
