import { z } from "zod";

import { AiIdentifierSchema } from "@/contracts";

export const DEFAULT_ALICE_AI_BASE_URL = "https://ai.api.cloud.yandex.net/v1";
export const DEFAULT_ALICE_AI_MODEL = "aliceai-llm-flash";
export const DEFAULT_ALICE_AI_REQUEST_TIMEOUT_MS = 5_000;
export const MIN_ALICE_AI_REQUEST_TIMEOUT_MS = 500;
export const MAX_ALICE_AI_REQUEST_TIMEOUT_MS = 30_000;

export const AliceAiConfigSchema = z
  .object({
    apiKey: z.string().trim().min(1).max(1_024),
    folderId: AiIdentifierSchema,
    baseUrl: z
      .url()
      .refine((value) => /^https?:\/\//.test(value), {
        message: "Alice AI base URL must use the http:// or https:// scheme",
      })
      .transform((value) => value.replace(/\/+$/, ""))
      .default(DEFAULT_ALICE_AI_BASE_URL),
    model: AiIdentifierSchema.default(DEFAULT_ALICE_AI_MODEL),
    requestTimeoutMs: z.coerce
      .number()
      .int()
      .min(MIN_ALICE_AI_REQUEST_TIMEOUT_MS)
      .max(MAX_ALICE_AI_REQUEST_TIMEOUT_MS)
      .default(DEFAULT_ALICE_AI_REQUEST_TIMEOUT_MS),
  })
  .strict();

export const AliceAiEnvironmentSchema = z
  .object({
    YANDEX_AI_API_KEY: z.string().optional(),
    YANDEX_AI_FOLDER_ID: z.string().optional(),
    YANDEX_AI_BASE_URL: z.string().optional(),
    YANDEX_AI_MODEL: z.string().optional(),
    YANDEX_AI_REQUEST_TIMEOUT_MS: z.union([z.string(), z.number()]).optional(),
  })
  .strict();

export type AliceAiConfig = z.infer<typeof AliceAiConfigSchema>;
export type AliceAiEnvironment = z.infer<typeof AliceAiEnvironmentSchema>;

export const parseAliceAiConfig = (input: unknown): AliceAiConfig => {
  const environment = AliceAiEnvironmentSchema.parse(input);

  return AliceAiConfigSchema.parse({
    apiKey: environment.YANDEX_AI_API_KEY,
    folderId: environment.YANDEX_AI_FOLDER_ID,
    baseUrl: environment.YANDEX_AI_BASE_URL,
    model: environment.YANDEX_AI_MODEL,
    requestTimeoutMs: environment.YANDEX_AI_REQUEST_TIMEOUT_MS,
  });
};
