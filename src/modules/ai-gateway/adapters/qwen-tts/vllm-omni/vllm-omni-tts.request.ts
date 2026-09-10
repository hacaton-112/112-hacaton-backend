import { z } from "zod";

import {
  AiIdentifierSchema,
  CallerReplyTextSchema,
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

const builtInVoices = [
  "aiden",
  "dylan",
  "eric",
  "ono_anna",
  "ryan",
  "serena",
  "sohee",
  "uncle_fu",
  "vivian",
] as const;

const speechRateInstructions = {
  медленный: "Темп речи слегка замедленный, без неестественных пауз.",
  обычный: "Темп речи обычный и ровный.",
  быстрый: "Темп речи слегка ускоренный, без проглатывания слов.",
} as const satisfies Record<VllmOmniSpeechRateLevel, string>;

export const normalizeVllmOmniVoice = (voiceId: string): string => {
  const voice = AiIdentifierSchema.parse(voiceId);
  const normalizedVoice = voice.toLowerCase();

  return (
    builtInVoices.find((candidate) => candidate === normalizedVoice) ?? voice
  );
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

  return `${buildQwenTtsInstruction(request.emotion, request.intensity)} ${speechRateInstructions[rate]}`;
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
