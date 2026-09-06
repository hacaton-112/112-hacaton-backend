import { z } from "zod";

export const DEFAULT_QWEN_TTS_BASE_URL = "http://127.0.0.1:8000";
export const DEFAULT_QWEN_TTS_MODEL =
  "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit";
export const DEFAULT_QWEN_TTS_STREAMING_INTERVAL_SECONDS = 0.32;
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

export const QwenTtsConfigSchema = z
  .object({
    baseUrl: z
      .url()
      .refine((value) => /^https?:\/\//.test(value), {
        message: "Qwen TTS base URL must use the http:// or https:// scheme",
      })
      .transform((value) => value.replace(/\/+$/, ""))
      .default(DEFAULT_QWEN_TTS_BASE_URL),
    model: QwenTtsModelSchema.default(DEFAULT_QWEN_TTS_MODEL),
    streamingIntervalSeconds: z.coerce
      .number()
      .min(MIN_QWEN_TTS_STREAMING_INTERVAL_SECONDS)
      .max(MAX_QWEN_TTS_STREAMING_INTERVAL_SECONDS)
      .default(DEFAULT_QWEN_TTS_STREAMING_INTERVAL_SECONDS),
    requestTimeoutMs: z.coerce
      .number()
      .int()
      .min(MIN_QWEN_TTS_REQUEST_TIMEOUT_MS)
      .max(MAX_QWEN_TTS_REQUEST_TIMEOUT_MS)
      .default(DEFAULT_QWEN_TTS_REQUEST_TIMEOUT_MS),
  })
  .strict();

export const QwenTtsEnvironmentSchema = z
  .object({
    QWEN_TTS_BASE_URL: z.string().optional(),
    QWEN_TTS_MODEL: z.string().optional(),
    QWEN_TTS_STREAMING_INTERVAL_SECONDS: z
      .union([z.string(), z.number()])
      .optional(),
    QWEN_TTS_REQUEST_TIMEOUT_MS: z.union([z.string(), z.number()]).optional(),
  })
  .strict();

export type QwenTtsConfig = z.infer<typeof QwenTtsConfigSchema>;
export type QwenTtsEnvironment = z.infer<typeof QwenTtsEnvironmentSchema>;

export const parseQwenTtsConfig = (input: unknown): QwenTtsConfig => {
  const environment = QwenTtsEnvironmentSchema.parse(input);

  return QwenTtsConfigSchema.parse({
    baseUrl: environment.QWEN_TTS_BASE_URL,
    model: environment.QWEN_TTS_MODEL,
    streamingIntervalSeconds: environment.QWEN_TTS_STREAMING_INTERVAL_SECONDS,
    requestTimeoutMs: environment.QWEN_TTS_REQUEST_TIMEOUT_MS,
  });
};
