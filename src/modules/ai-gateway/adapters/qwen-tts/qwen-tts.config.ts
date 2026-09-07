import { z } from "zod";

import { VllmOmniTtsConfigSchema } from "./vllm-omni/vllm-omni-tts.config";

export const QwenTtsProviderSchema = z.enum(["mlx-audio", "vllm-omni"]);

export const DEFAULT_QWEN_TTS_PROVIDER = "mlx-audio";
export const DEFAULT_MLX_AUDIO_TTS_BASE_URL = "http://127.0.0.1:8000";
export const DEFAULT_MLX_AUDIO_TTS_MODEL =
  "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit";
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

export const MlxAudioTtsConfigSchema = z
  .object({
    provider: z.literal("mlx-audio"),
    baseUrl: z
      .url()
      .refine((value) => /^https?:\/\//.test(value), {
        message: "Qwen TTS base URL must use the http:// or https:// scheme",
      })
      .transform((value) => value.replace(/\/+$/, ""))
      .default(DEFAULT_MLX_AUDIO_TTS_BASE_URL),
    model: QwenTtsModelSchema.default(DEFAULT_MLX_AUDIO_TTS_MODEL),
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

export const QwenTtsConfigSchema = z.discriminatedUnion("provider", [
  MlxAudioTtsConfigSchema,
  VllmOmniTtsConfigSchema,
]);

export const QwenTtsEnvironmentSchema = z
  .object({
    QWEN_TTS_PROVIDER: QwenTtsProviderSchema.optional(),
    QWEN_TTS_BASE_URL: z.string().optional(),
    QWEN_TTS_MODEL: z.string().optional(),
    QWEN_TTS_STREAMING_INTERVAL_SECONDS: z
      .union([z.string(), z.number()])
      .optional(),
    QWEN_TTS_REQUEST_TIMEOUT_MS: z.union([z.string(), z.number()]).optional(),
  })
  .strict();

export type QwenTtsProvider = z.infer<typeof QwenTtsProviderSchema>;
export type MlxAudioTtsConfig = z.infer<typeof MlxAudioTtsConfigSchema>;
export type QwenTtsConfig = z.infer<typeof QwenTtsConfigSchema>;
export type QwenTtsEnvironment = z.infer<typeof QwenTtsEnvironmentSchema>;

export const parseQwenTtsConfig = (input: unknown): QwenTtsConfig => {
  const environment = QwenTtsEnvironmentSchema.parse(input);
  const provider = environment.QWEN_TTS_PROVIDER ?? DEFAULT_QWEN_TTS_PROVIDER;

  if (provider === "mlx-audio") {
    return MlxAudioTtsConfigSchema.parse({
      provider,
      baseUrl: environment.QWEN_TTS_BASE_URL,
      model: environment.QWEN_TTS_MODEL,
      streamingIntervalSeconds: environment.QWEN_TTS_STREAMING_INTERVAL_SECONDS,
      requestTimeoutMs: environment.QWEN_TTS_REQUEST_TIMEOUT_MS,
    });
  }

  return VllmOmniTtsConfigSchema.parse({
    provider,
    baseUrl: environment.QWEN_TTS_BASE_URL,
    model: environment.QWEN_TTS_MODEL,
    requestTimeoutMs: environment.QWEN_TTS_REQUEST_TIMEOUT_MS,
  });
};
