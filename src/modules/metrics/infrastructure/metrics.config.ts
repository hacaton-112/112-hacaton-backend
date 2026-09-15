import { z } from "zod";

const MetricsConfigSchema = z.object({
  METRICS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  METRICS_HOST: z.string().trim().min(1).default("0.0.0.0"),
  METRICS_PORT: z.coerce.number().int().min(0).max(65_535).default(9_464),
});

export type MetricsEnvironment = z.input<typeof MetricsConfigSchema>;

export interface MetricsConfig {
  readonly enabled: boolean;
  readonly host: string;
  /** `0` — выбрать свободный порт; нужен тестам, а не боевой настройке. */
  readonly port: number;
}

export const parseMetricsConfig = (
  environment: Partial<Record<keyof MetricsEnvironment, unknown>>,
): MetricsConfig => {
  const parsed = MetricsConfigSchema.parse(environment);

  return {
    enabled: parsed.METRICS_ENABLED,
    host: parsed.METRICS_HOST,
    port: parsed.METRICS_PORT,
  };
};
