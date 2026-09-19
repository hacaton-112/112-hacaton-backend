import { z } from "zod";

export const PiperTtsConfigSchema = z
  .object({
    provider: z.literal("piper"),
    mode: z.literal("custom-voice").default("custom-voice"),
    model: z.string().default("piper"),
    baseUrl: z
      .url()
      .refine((value) => /^https?:\/\//.test(value), {
        message: "Piper TTS base URL must use the http:// or https:// scheme",
      })
      .transform((value) => value.replace(/\/+$/, ""))
      .default("http://127.0.0.1:5000"),
    maleVoice: z.string().trim().min(1).max(128).default("ru_RU-dmitri-medium"),
    femaleVoice: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .default("ru_RU-irina-medium"),
    requestTimeoutMs: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(300_000)
      .default(60_000),
  })
  .strict();

export type PiperTtsConfig = z.infer<typeof PiperTtsConfigSchema>;
