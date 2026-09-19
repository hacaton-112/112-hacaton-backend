import { z } from "zod";

import {
  loadQwenTtsReferenceVoiceRegistry,
  QwenTtsReferenceVoiceRegistrySchema,
  type QwenTtsReferenceVoiceRegistry,
} from "./qwen-tts.reference-voices";
import { VllmOmniTtsConfigSchema } from "./vllm-omni/vllm-omni-tts.config";
import { PiperTtsConfigSchema } from "./piper/piper-tts.config";

export const QwenTtsProviderSchema = z.enum([
  "mlx-audio",
  "vllm-omni",
  "piper",
]);
export const QwenTtsModeSchema = z.enum(["custom-voice", "base-icl"]);

export const DEFAULT_QWEN_TTS_PROVIDER = "mlx-audio";
export const DEFAULT_QWEN_TTS_MODE = "custom-voice";
export const DEFAULT_MLX_AUDIO_TTS_BASE_URL = "http://127.0.0.1:8000";
export const DEFAULT_MLX_AUDIO_CUSTOM_VOICE_MODEL =
  "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit";
export const DEFAULT_MLX_AUDIO_BASE_ICL_MODEL =
  "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit";
/** @deprecated Use the mode-specific constant. */
export const DEFAULT_MLX_AUDIO_TTS_MODEL = DEFAULT_MLX_AUDIO_CUSTOM_VOICE_MODEL;
export const DEFAULT_MLX_AUDIO_TTS_STREAMING_INTERVAL_SECONDS = 0.32;
export const MIN_QWEN_TTS_STREAMING_INTERVAL_SECONDS = 0.08;
export const MAX_QWEN_TTS_STREAMING_INTERVAL_SECONDS = 2;
export const DEFAULT_QWEN_TTS_REQUEST_TIMEOUT_MS = 60_000;
export const MIN_QWEN_TTS_REQUEST_TIMEOUT_MS = 1_000;
export const MAX_QWEN_TTS_REQUEST_TIMEOUT_MS = 300_000;
export const QWEN_TTS_SAMPLE_RATE = 24_000;
export const QWEN_TTS_CHANNELS = 1;
export const QWEN_TTS_AUDIO_FORMAT = "pcm_s16le";

const QwenTtsModelSchema = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);

const QwenTtsBaseModelSchema = QwenTtsModelSchema.refine(
  (model) => /(?:^|[-_/])base(?:$|[-_/])/iu.test(model),
  "Base ICL mode requires a Qwen3-TTS Base model",
);

const MlxAudioTtsCommonConfigSchema = z
  .object({
    provider: z.literal("mlx-audio"),
    baseUrl: z
      .url()
      .refine((value) => /^https?:\/\//.test(value), {
        message: "Qwen TTS base URL must use the http:// or https:// scheme",
      })
      .transform((value) => value.replace(/\/+$/, ""))
      .default(DEFAULT_MLX_AUDIO_TTS_BASE_URL),
    streamingIntervalSeconds: z.coerce
      .number()
      .min(MIN_QWEN_TTS_STREAMING_INTERVAL_SECONDS)
      .max(MAX_QWEN_TTS_STREAMING_INTERVAL_SECONDS)
      .default(DEFAULT_MLX_AUDIO_TTS_STREAMING_INTERVAL_SECONDS),
    requestTimeoutMs: z.coerce
      .number()
      .int()
      .min(MIN_QWEN_TTS_REQUEST_TIMEOUT_MS)
      .max(MAX_QWEN_TTS_REQUEST_TIMEOUT_MS)
      .default(DEFAULT_QWEN_TTS_REQUEST_TIMEOUT_MS),
  })
  .strict();

export const MlxAudioCustomVoiceConfigSchema =
  MlxAudioTtsCommonConfigSchema.extend({
    mode: z.literal("custom-voice"),
    model: QwenTtsModelSchema.default(DEFAULT_MLX_AUDIO_CUSTOM_VOICE_MODEL),
  }).strict();

export const MlxAudioBaseIclConfigSchema = MlxAudioTtsCommonConfigSchema.extend(
  {
    mode: z.literal("base-icl"),
    model: QwenTtsBaseModelSchema.default(DEFAULT_MLX_AUDIO_BASE_ICL_MODEL),
    referenceVoices: QwenTtsReferenceVoiceRegistrySchema,
  },
).strict();

export const MlxAudioTtsConfigSchema = z.discriminatedUnion("mode", [
  MlxAudioCustomVoiceConfigSchema,
  MlxAudioBaseIclConfigSchema,
]);

export const QwenTtsConfigSchema = z.union([
  MlxAudioTtsConfigSchema,
  VllmOmniTtsConfigSchema,
  PiperTtsConfigSchema,
]);

export const QwenTtsEnvironmentSchema = z
  .object({
    QWEN_TTS_PROVIDER: QwenTtsProviderSchema.optional(),
    QWEN_TTS_MODE: QwenTtsModeSchema.optional(),
    QWEN_TTS_BASE_URL: z.string().optional(),
    QWEN_TTS_MODEL: z.string().optional(),
    QWEN_TTS_REFERENCE_VOICES_PATH: z.string().trim().min(1).optional(),
    QWEN_TTS_STREAMING_INTERVAL_SECONDS: z
      .union([z.string(), z.number()])
      .optional(),
    QWEN_TTS_REQUEST_TIMEOUT_MS: z.union([z.string(), z.number()]).optional(),
    PIPER_TTS_BASE_URL: z.string().optional(),
    PIPER_TTS_MALE_VOICE: z.string().optional(),
    PIPER_TTS_FEMALE_VOICE: z.string().optional(),
  })
  .strict();

export type QwenTtsProvider = z.infer<typeof QwenTtsProviderSchema>;
export type QwenTtsMode = z.infer<typeof QwenTtsModeSchema>;
export type MlxAudioTtsConfig = z.infer<typeof MlxAudioTtsConfigSchema>;
export type QwenTtsConfig = z.infer<typeof QwenTtsConfigSchema>;
export type QwenTtsEnvironment = z.infer<typeof QwenTtsEnvironmentSchema>;

export type QwenTtsReferenceVoiceRegistryLoader = (
  path: string,
) => QwenTtsReferenceVoiceRegistry;

export const parseQwenTtsConfig = (
  input: unknown,
  loadReferenceVoices: QwenTtsReferenceVoiceRegistryLoader = loadQwenTtsReferenceVoiceRegistry,
): QwenTtsConfig => {
  const environment = QwenTtsEnvironmentSchema.parse(input);
  const provider = environment.QWEN_TTS_PROVIDER ?? DEFAULT_QWEN_TTS_PROVIDER;
  const mode = environment.QWEN_TTS_MODE ?? DEFAULT_QWEN_TTS_MODE;
  const referenceVoicesPath = environment.QWEN_TTS_REFERENCE_VOICES_PATH;

  if (provider === "piper") {
    return PiperTtsConfigSchema.parse({
      provider,
      mode: "custom-voice",
      model: "piper",
      baseUrl: environment.PIPER_TTS_BASE_URL,
      maleVoice: environment.PIPER_TTS_MALE_VOICE,
      femaleVoice: environment.PIPER_TTS_FEMALE_VOICE,
      requestTimeoutMs: environment.QWEN_TTS_REQUEST_TIMEOUT_MS,
    });
  }

  if (mode === "base-icl" && referenceVoicesPath === undefined) {
    throw new Error("Base ICL mode requires QWEN_TTS_REFERENCE_VOICES_PATH");
  }

  const referenceVoices =
    mode === "base-icl" && referenceVoicesPath !== undefined
      ? loadReferenceVoices(referenceVoicesPath)
      : undefined;

  if (provider === "mlx-audio") {
    return MlxAudioTtsConfigSchema.parse({
      provider,
      mode,
      baseUrl: environment.QWEN_TTS_BASE_URL,
      model: environment.QWEN_TTS_MODEL,
      streamingIntervalSeconds: environment.QWEN_TTS_STREAMING_INTERVAL_SECONDS,
      requestTimeoutMs: environment.QWEN_TTS_REQUEST_TIMEOUT_MS,
      ...(referenceVoices === undefined ? {} : { referenceVoices }),
    });
  }

  return VllmOmniTtsConfigSchema.parse({
    provider,
    mode,
    baseUrl: environment.QWEN_TTS_BASE_URL,
    model: environment.QWEN_TTS_MODEL,
    requestTimeoutMs: environment.QWEN_TTS_REQUEST_TIMEOUT_MS,
    ...(referenceVoices === undefined ? {} : { referenceVoices }),
  });
};
