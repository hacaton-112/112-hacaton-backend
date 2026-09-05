import { createEnv } from "@t3-oss/env-core";
import * as dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

export const env = createEnv({
  server: {
    // ── Application ──────────────────────────────────────────────
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),

    // ── Server ───────────────────────────────────────────────────
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    // ── CORS ─────────────────────────────────────────────────────
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:1420,tauri://localhost"),

    // ── Database ─────────────────────────────────────────────────
    DATABASE_URL: z
      .url()
      .refine((url) => /^postgres(ql)?:\/\//.test(url), {
        message: "DATABASE_URL must use the postgresql:// or postgres:// scheme",
      }),
    ASR_SERVICE_URL: z
      .url()
      .refine((url) => /^https?:\/\//.test(url), {
        message: "ASR_SERVICE_URL must use the http:// or https:// scheme",
      })
      .default("http://127.0.0.1:8787"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
