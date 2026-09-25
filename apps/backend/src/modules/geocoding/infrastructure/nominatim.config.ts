import { z } from "zod";

export const DEFAULT_NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
export const DEFAULT_NOMINATIM_USER_AGENT = "system-112-training/0.1";
export const DEFAULT_NOMINATIM_REQUEST_TIMEOUT_MS = 5_000;
export const DEFAULT_NOMINATIM_CACHE_TTL_SECONDS = 86_400;

const NominatimConfigSchema = z
  .object({
    baseUrl: z
      .url()
      .refine((value) => /^https?:\/\//.test(value), {
        message: "Nominatim base URL must use the http:// or https:// scheme",
      })
      .transform((value) => value.replace(/\/+$/, ""))
      .default(DEFAULT_NOMINATIM_BASE_URL),
    userAgent: z
      .string()
      .trim()
      .min(3)
      .max(256)
      .default(DEFAULT_NOMINATIM_USER_AGENT),
    requestTimeoutMs: z.coerce
      .number()
      .int()
      .min(500)
      .max(30_000)
      .default(DEFAULT_NOMINATIM_REQUEST_TIMEOUT_MS),
    cacheTtlSeconds: z.coerce
      .number()
      .int()
      .min(60)
      .max(2_592_000)
      .default(DEFAULT_NOMINATIM_CACHE_TTL_SECONDS),
  })
  .strict();

const NominatimEnvironmentSchema = z
  .object({
    NOMINATIM_BASE_URL: z.string().optional(),
    NOMINATIM_USER_AGENT: z.string().optional(),
    NOMINATIM_REQUEST_TIMEOUT_MS: z.union([z.string(), z.number()]).optional(),
    NOMINATIM_CACHE_TTL_SECONDS: z.union([z.string(), z.number()]).optional(),
  })
  .strict();

export type NominatimConfig = z.infer<typeof NominatimConfigSchema>;

export const parseNominatimConfig = (input: unknown): NominatimConfig => {
  const environment = NominatimEnvironmentSchema.parse(input);

  return NominatimConfigSchema.parse({
    baseUrl: environment.NOMINATIM_BASE_URL,
    userAgent: environment.NOMINATIM_USER_AGENT,
    requestTimeoutMs: environment.NOMINATIM_REQUEST_TIMEOUT_MS,
    cacheTtlSeconds: environment.NOMINATIM_CACHE_TTL_SECONDS,
  });
};
