import { createEnv } from "@t3-oss/env-core";
import * as dotenv from "dotenv";
import { z } from "zod";

import {
  applyDeprecatedEnvironmentAliases,
  deprecatedEnvironmentWarning,
} from "./env-aliases";

dotenv.config();

// Перенос до createEnv: иначе окружение со старыми именами не пройдёт проверку,
// и причина окажется не названа.
const deprecatedNames = applyDeprecatedEnvironmentAliases(process.env);

if (deprecatedNames.length > 0 && process.env.NODE_ENV !== "test") {
  console.warn(deprecatedEnvironmentWarning(deprecatedNames));
}

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
    // Production NGINX is the only hop allowed to supply forwarded client data.
    // Keep zero for direct development access so clients cannot spoof req.ip.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
    VOICE_PIPELINE_DEMO_ENABLED: BooleanEnvironmentSchema,
    SCENARIO_AUDIO_WORKER_ENABLED: BooleanEnvironmentSchema,
    LLM_PROVIDER: z.enum(["alice", "local"]).default("alice"),
    LLM_REPLY_PROTOCOL: z.enum(["legacy", "caller-v2"]).default("legacy"),
    TOOLS_LLM_BASE_URL: z
      .url()
      .refine((url) => /^https?:\/\//.test(url), {
        message: "TOOLS_LLM_BASE_URL must use the http:// or https:// scheme",
      })
      .optional(),
    TOOLS_LLM_MODEL: z.string().trim().min(1).max(200).default("tools-model"),
    TOOLS_LLM_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(500)
      .max(300_000)
      .default(120_000),
    TOOLS_LLM_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),

    // ── Профиль голосового тракта ────────────────────────────────
    // Читаются через ConfigService в offline-policy; объявлены здесь, чтобы
    // профиль демо не приходилось искать по коду.
    VOICE_EXECUTION_PROFILE: z
      .enum(["standard", "offline-hybrid"])
      .default("standard"),
    VOICE_EXCEPTION_BUDGET_MS: z.coerce
      .number()
      .int()
      .min(500)
      .max(30_000)
      .default(8_000),
    OFFLINE_AI_HOSTS: z.string().trim().min(1).optional(),

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

    // AUTH_, not JWT_: refresh tokens are opaque secrets, not signed tokens.
    // Idle window of a single refresh token.
    AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(7_776_000)
      .default(2_592_000),
    // Absolute cap on a rotation chain; a refresh never extends it.
    AUTH_SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(3_600)
      .max(31_536_000)
      .default(7_776_000),

    // ── Call recording ───────────────────────────────────────────
    // Выключено по умолчанию: без объектного хранилища рядом разработчик
    // должен получать работающий звонок, а не отказ на первой же реплике.
    CALL_RECORDING_ENABLED: BooleanEnvironmentSchema,
    // Адрес совместимого с S3 хранилища; для MinIO это его собственный порт.
    CALL_RECORDING_S3_ENDPOINT: z
      .url()
      .refine((url) => /^https?:\/\//.test(url), {
        message:
          "CALL_RECORDING_S3_ENDPOINT must use the http:// or https:// scheme",
      })
      .default("http://127.0.0.1:9000"),
    CALL_RECORDING_S3_REGION: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .default("us-east-1"),
    CALL_RECORDING_S3_BUCKET: z
      .string()
      .trim()
      .min(3)
      .max(63)
      .regex(/^[a-z0-9][a-z0-9.-]*$/)
      .default("call-recordings"),
    CALL_RECORDING_S3_ACCESS_KEY_ID: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .optional(),
    CALL_RECORDING_S3_SECRET_ACCESS_KEY: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .optional(),

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

    // ── Grammar ──────────────────────────────────────────────────
    /**
     * Углублённая проверка текста моделью.
     *
     * Выключена по умолчанию: правила работают без сети, а изолированный
     * контур внешнего провайдера может не иметь вовсе.
     */
    GRAMMAR_MODEL_REVIEW_ENABLED: BooleanEnvironmentSchema,

    // ── Reverse geocoding ──────────────────────────────────────
    NOMINATIM_BASE_URL: z
      .url()
      .refine((url) => /^https?:\/\//.test(url), {
        message: "NOMINATIM_BASE_URL must use the http:// or https:// scheme",
      })
      .default("https://nominatim.openstreetmap.org"),
    NOMINATIM_USER_AGENT: z
      .string()
      .trim()
      .min(3)
      .max(256)
      .default("system-112-training/0.1"),
    NOMINATIM_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(500)
      .max(30_000)
      .default(5_000),
    NOMINATIM_CACHE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(2_592_000)
      .default(86_400),

    // Адрес по точке собирается из собственных тайлов: внешний Nominatim в
    // закрытом контуре недоступен и остаётся только для разработки.
    REVERSE_GEOCODER_PROVIDER: z.enum(["tiles", "nominatim"]).default("tiles"),
    MAP_TILES_BASE_URL: z
      .url()
      .default("http://tileserver:8080/data/openmaptiles"),
    MAP_TILES_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(200)
      .max(30_000)
      .default(3_000),

    // ── Журнал аудита ───────────────────────────────────────────
    // Записи аудита хранятся ограниченный срок: журнал растёт с каждым
    // действием, а бессрочное хранение персональных данных обучающихся не
    // нужно ни для разбора занятия, ни для проверки.
    AUDIT_LOG_RETENTION_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    AUDIT_LOG_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(30)
      .max(3_650)
      .default(365),

    // ── Qwen TTS ────────────────────────────────────────────────
    TTS_PROVIDER: z
      .enum(["mlx-audio", "vllm-omni", "piper"])
      .default("mlx-audio"),
    TTS_MODE: z.enum(["custom-voice", "base-icl"]).default("custom-voice"),
    TTS_BASE_URL: z
      .url()
      .refine((url) => /^https?:\/\//.test(url), {
        message: "TTS_BASE_URL must use the http:// or https:// scheme",
      })
      .optional(),
    TTS_MODEL: z
      .string()
      .trim()
      .min(1)
      .max(256)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/)
      .optional(),
    TTS_REFERENCE_VOICES_PATH: z.string().trim().min(1).max(1_024).optional(),
    TTS_STREAMING_INTERVAL_SECONDS: z.coerce
      .number()
      .min(0.08)
      .max(2)
      .optional(),
    TTS_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(300_000)
      .default(60_000),
    PIPER_TTS_BASE_URL: z
      .url()
      .refine((url) => /^https?:\/\//.test(url), {
        message: "PIPER_TTS_BASE_URL must use the http:// or https:// scheme",
      })
      .optional(),
    PIPER_TTS_MALE_VOICE: z.string().trim().min(1).max(128).optional(),
    PIPER_TTS_FEMALE_VOICE: z.string().trim().min(1).max(128).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
