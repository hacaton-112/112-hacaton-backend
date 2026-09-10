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
import { resolveQwenTtsReferenceVoice } from "../qwen-tts.reference-voices";
import type { VllmOmniTtsConfig } from "./vllm-omni-tts.config";

export const VLLM_OMNI_TTS_MAX_NEW_TOKENS = 1_200;

export const VllmOmniSpeechRateLevelSchema = z.enum([
  "медленный",
  "обычный",
  "быстрый",
]);

const VllmOmniCommonSpeechRequestSchema = z
  .object({
    model: z.string().trim().min(1).max(256),
    input: CallerReplyTextSchema,
    language: z.literal("Russian"),
    instructions: z.string().trim().min(1).max(768),
    response_format: z.literal("pcm"),
    sample_rate: z.literal(QWEN_TTS_SAMPLE_RATE),
    stream: z.literal(true),
    stream_format: z.literal("audio"),
    max_new_tokens: z.literal(VLLM_OMNI_TTS_MAX_NEW_TOKENS),
  })
  .strict();

export const VllmOmniCustomVoiceSpeechRequestSchema =
  VllmOmniCommonSpeechRequestSchema.extend({
    voice: AiIdentifierSchema,
    task_type: z.literal("CustomVoice"),
  }).strict();

export const VllmOmniBaseIclSpeechRequestSchema =
  VllmOmniCommonSpeechRequestSchema.extend({
    task_type: z.literal("Base"),
    ref_audio: z.string().startsWith("data:audio/wav;base64,"),
    ref_text: z.string().trim().min(3).max(2_000),
    x_vector_only_mode: z.literal(false),
  }).strict();

export const VllmOmniTtsSpeechRequestSchema = z.union([
  VllmOmniCustomVoiceSpeechRequestSchema,
  VllmOmniBaseIclSpeechRequestSchema,
]);

export type VllmOmniSpeechRateLevel = z.infer<
  typeof VllmOmniSpeechRateLevelSchema
>;
export type VllmOmniTtsSpeechRequest = z.infer<
  typeof VllmOmniTtsSpeechRequestSchema
>;

const speechRateInstructions = {
  медленный: "Темп речи слегка замедленный, без неестественных пауз.",
  обычный: "Темп речи обычный и ровный.",
  быстрый: "Темп речи слегка ускоренный, без проглатывания слов.",
} as const satisfies Record<VllmOmniSpeechRateLevel, string>;

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
    `Голос: ${voice}. ${speechRateInstructions[rate]}`
  );
};

export const buildVllmOmniTtsRequest = (
  rawRequest: TtsSynthesisRequest,
  config: VllmOmniTtsConfig,
): VllmOmniTtsSpeechRequest => {
  const request = TtsSynthesisRequestSchema.parse(rawRequest);
  const commonRequest = {
    model: config.model,
    input: request.text,
    language: request.language,
    instructions: buildVllmOmniTtsInstruction(request),
    response_format: "pcm" as const,
    sample_rate: QWEN_TTS_SAMPLE_RATE,
    stream: true as const,
    stream_format: "audio" as const,
    max_new_tokens: VLLM_OMNI_TTS_MAX_NEW_TOKENS,
  };

  if (config.mode === "custom-voice") {
    return VllmOmniCustomVoiceSpeechRequestSchema.parse({
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
  }

  const reference = resolveQwenTtsReferenceVoice(
    config.referenceVoices,
    request.voiceId,
    request.gender,
  );

  return VllmOmniBaseIclSpeechRequestSchema.parse({
    ...commonRequest,
    task_type: "Base",
    ref_audio: reference.audioDataUrl,
    ref_text: reference.refText,
    x_vector_only_mode: false,
  });
};
