import * as Joi from "joi";

export const envValidationSchema = Joi.object({
  // ── Application ──────────────────────────────────────────────
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development")
    .description("Окружение приложения"),

  // ── Server ───────────────────────────────────────────────────
  HOST: Joi.string().default("0.0.0.0").description("Адрес сервера"),

  PORT: Joi.number().port().default(3000).description("Порт сервера"),

  // ── CORS ─────────────────────────────────────────────────────
  CORS_ORIGINS: Joi.string()
    .default("http://localhost:1420,tauri://localhost")
    .description("Comma-separated list of allowed CORS origins"),

  // ── Database ─────────────────────────────────────────────────
  DATABASE_URL: Joi.string()
    .uri({ scheme: ["postgresql", "postgres"] })
    .required()
    .description("URL подключения к PostgreSQL"),

  // ── Alice AI ─────────────────────────────────────────────────
  YANDEX_AI_API_KEY: Joi.string()
    .trim()
    .min(1)
    .optional()
    .description("API key сервисного аккаунта Yandex Cloud"),

  YANDEX_AI_FOLDER_ID: Joi.string()
    .trim()
    .min(1)
    .optional()
    .description("Идентификатор каталога Yandex Cloud"),

  YANDEX_AI_BASE_URL: Joi.string()
    .uri({ scheme: ["https", "http"] })
    .default("https://ai.api.cloud.yandex.net/v1")
    .description("Базовый URL OpenAI-compatible API Alice AI"),

  YANDEX_AI_MODEL: Joi.string()
    .trim()
    .min(1)
    .default("aliceai-llm-flash")
    .description("Идентификатор модели Alice AI"),

  YANDEX_AI_REQUEST_TIMEOUT_MS: Joi.number()
    .integer()
    .min(500)
    .max(30_000)
    .default(5_000)
    .description("Таймаут запроса к Alice AI в миллисекундах"),
})
  .unknown()
  .required();
