import { createEnv } from "@t3-oss/env-core";
import * as dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const BooleanEnvironmentSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

export const env = createEnv({
  server: {
    // ── Application ──────────────────────────────────────────────
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),

    // ── Server ───────────────────────────────────────────────────
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    VOICE_PIPELINE_DEMO_ENABLED: BooleanEnvironmentSchema,

    // ── CORS ─────────────────────────────────────────────────────
    CORS_ORIGINS: z
      .string()
      .default(
        "http://localhost:1420,http://tauri.localhost,tauri://localhost",
      ),

    // ── Database ─────────────────────────────────────────────────
    DATABASE_URL: z.url().refine((url) => /^postgres(ql)?:\/\//.test(url), {
      message: "DATABASE_URL must use the postgresql:// or postgres:// scheme",
    }),
    ASR_SERVICE_URL: z
      .url()
      .refine((url) => /^https?:\/\//.test(url), {
        message: "ASR_SERVICE_URL must use the http:// or https:// scheme",
      })
      .default("http://127.0.0.1:8787"),

    // ── Auth ─────────────────────────────────────────────────────
    JWT_SECRET: z.string().min(32).max(512),
    JWT_ACCESS_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(86_400)
      .default(3_600),

    // ── Alice AI ─────────────────────────────────────────────────
    YANDEX_AI_API_KEY: z.string().trim().min(1).max(1_024).optional(),
    YANDEX_AI_FOLDER_ID: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
      .optional(),
    YANDEX_AI_BASE_URL: z
      .url()
      .refine((url) => /^https?:\/\//.test(url), {
        message: "YANDEX_AI_BASE_URL must use the http:// or https:// scheme",
      })
      .default("https://ai.api.cloud.yandex.net/v1"),
    YANDEX_AI_MODEL: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
      .default("aliceai-llm-flash"),
    YANDEX_AI_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(500)
      .max(30_000)
      .default(5_000),

    // ── Qwen TTS ────────────────────────────────────────────────
    QWEN_TTS_PROVIDER: z.enum(["mlx-audio", "vllm-omni"]).default("mlx-audio"),
    QWEN_TTS_BASE_URL: z
      .url()
      .refine((url) => /^https?:\/\//.test(url), {
        message: "QWEN_TTS_BASE_URL must use the http:// or https:// scheme",
      })
      .optional(),
    QWEN_TTS_MODEL: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/)
      .optional(),
    QWEN_TTS_STREAMING_INTERVAL_SECONDS: z.coerce
      .number()
      .min(0.08)
      .max(2)
      .optional(),
    QWEN_TTS_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(300_000)
      .default(60_000),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
