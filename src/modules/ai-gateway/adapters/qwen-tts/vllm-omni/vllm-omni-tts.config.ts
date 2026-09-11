import { z } from "zod";

import { QwenTtsReferenceVoiceRegistrySchema } from "../qwen-tts.reference-voices";

export const DEFAULT_VLLM_OMNI_TTS_BASE_URL = "http://127.0.0.1:8091";
export const DEFAULT_VLLM_OMNI_CUSTOM_VOICE_MODEL =
  "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice";
export const DEFAULT_VLLM_OMNI_BASE_ICL_MODEL =
  "Qwen/Qwen3-TTS-12Hz-1.7B-Base";
/** @deprecated Use the mode-specific constant. */
export const DEFAULT_VLLM_OMNI_TTS_MODEL =
  DEFAULT_VLLM_OMNI_CUSTOM_VOICE_MODEL;
export const DEFAULT_VLLM_OMNI_TTS_REQUEST_TIMEOUT_MS = 60_000;

const VllmOmniModelSchema = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);

const VllmOmniBaseModelSchema = VllmOmniModelSchema.refine(
  (model) => /(?:^|[-_/])base(?:$|[-_/])/iu.test(model),
  "Base ICL mode requires a Qwen3-TTS Base model",
);

const VllmOmniTtsCommonConfigSchema = z
  .object({
    provider: z.literal("vllm-omni"),
    baseUrl: z
      .url()
      .refine((value) => /^https?:\/\//.test(value), {
        message: "vLLM Omni TTS base URL must use http:// or https://",
      })
      .transform((value) => value.replace(/\/+$/, ""))
      .default(DEFAULT_VLLM_OMNI_TTS_BASE_URL),
    requestTimeoutMs: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(300_000)
      .default(DEFAULT_VLLM_OMNI_TTS_REQUEST_TIMEOUT_MS),
  })
  .strict();

export const VllmOmniCustomVoiceConfigSchema =
  VllmOmniTtsCommonConfigSchema.extend({
    mode: z.literal("custom-voice"),
    model: VllmOmniModelSchema.default(DEFAULT_VLLM_OMNI_CUSTOM_VOICE_MODEL),
  }).strict();

export const VllmOmniBaseIclConfigSchema =
  VllmOmniTtsCommonConfigSchema.extend({
    mode: z.literal("base-icl"),
    model: VllmOmniBaseModelSchema.default(DEFAULT_VLLM_OMNI_BASE_ICL_MODEL),
    referenceVoices: QwenTtsReferenceVoiceRegistrySchema,
  }).strict();

export const VllmOmniTtsConfigSchema = z.discriminatedUnion("mode", [
  VllmOmniCustomVoiceConfigSchema,
  VllmOmniBaseIclConfigSchema,
]);

export type VllmOmniTtsConfig = z.infer<typeof VllmOmniTtsConfigSchema>;
