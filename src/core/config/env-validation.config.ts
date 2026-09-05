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
  ASR_SERVICE_URL: Joi.string()
    .uri({ scheme: ["http", "https"] })
    .default("http://127.0.0.1:8787")
    .description("Axum ASR service base URL"),
})
  .unknown()
  .required();
