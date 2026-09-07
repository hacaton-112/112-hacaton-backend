import { z } from "zod";

export const DEFAULT_VLLM_OMNI_TTS_BASE_URL = "http://127.0.0.1:8091";
export const DEFAULT_VLLM_OMNI_TTS_MODEL =
  "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice";
export const DEFAULT_VLLM_OMNI_TTS_REQUEST_TIMEOUT_MS = 60_000;

export const VllmOmniTtsConfigSchema = z
  .object({
    baseUrl: z
      .url()
      .refine((value) => /^https?:\/\//.test(value), {
        message: "vLLM Omni TTS base URL must use http:// or https://",
      })
      .transform((value) => value.replace(/\/+$/, ""))
      .default(DEFAULT_VLLM_OMNI_TTS_BASE_URL),
    model: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/)
      .default(DEFAULT_VLLM_OMNI_TTS_MODEL),
    requestTimeoutMs: z
      .number()
      .int()
      .min(1_000)
      .max(300_000)
      .default(DEFAULT_VLLM_OMNI_TTS_REQUEST_TIMEOUT_MS),
  })
  .strict();

export type VllmOmniTtsConfig = z.infer<typeof VllmOmniTtsConfigSchema>;
