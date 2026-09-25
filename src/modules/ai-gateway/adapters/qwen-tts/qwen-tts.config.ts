import { z } from "zod";

import { PiperTtsConfigSchema } from "./piper/piper-tts.config";

/**
 * Настройки синтеза речи.
 *
 * Провайдер один: Piper работает на процессоре и целиком внутри контура.
 * Облачные варианты синтеза из тренажёра убраны — в закрытой сети они всё
 * равно недоступны, а выбор между ними лишь давал повод настроить стенд так,
 * что он замолкает.
 */
export const QwenTtsConfigSchema = PiperTtsConfigSchema;

/** Формат потока, на который рассчитан весь звуковой тракт тренажёра. */
export const QWEN_TTS_SAMPLE_RATE = 24_000;
export const QWEN_TTS_CHANNELS = 1;
export const QWEN_TTS_AUDIO_FORMAT = "pcm_s16le";

export const DEFAULT_TTS_REQUEST_TIMEOUT_MS = 60_000;
export const MIN_TTS_REQUEST_TIMEOUT_MS = 1_000;
export const MAX_TTS_REQUEST_TIMEOUT_MS = 300_000;

export const QwenTtsEnvironmentSchema = z
  .object({
    TTS_REQUEST_TIMEOUT_MS: z.union([z.string(), z.number()]).optional(),
    PIPER_TTS_BASE_URL: z.string().optional(),
    PIPER_TTS_MALE_VOICE: z.string().optional(),
    PIPER_TTS_FEMALE_VOICE: z.string().optional(),
  })
  .strict();

export type QwenTtsConfig = z.infer<typeof QwenTtsConfigSchema>;
export type QwenTtsEnvironment = z.infer<typeof QwenTtsEnvironmentSchema>;

export const parseQwenTtsConfig = (input: unknown): QwenTtsConfig => {
  const environment = QwenTtsEnvironmentSchema.parse(input);

  return QwenTtsConfigSchema.parse({
    provider: "piper",
    mode: "custom-voice",
    model: "piper",
    baseUrl: environment.PIPER_TTS_BASE_URL,
    maleVoice: environment.PIPER_TTS_MALE_VOICE,
    femaleVoice: environment.PIPER_TTS_FEMALE_VOICE,
    requestTimeoutMs: environment.TTS_REQUEST_TIMEOUT_MS,
  });
};
