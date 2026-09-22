import { z } from "zod";

/**
 * Настройка учебной IP-телефонии.
 *
 * Выключена по умолчанию: без Asterisk рабочее место ДДС работает как раньше, а
 * звонок наряду не становится обязательным шагом. Включение без адреса и
 * пароля ARI — ошибка запуска, а не тихо не работающие звонки.
 */
const TelephonyConfigSchema = z
  .object({
    TELEPHONY_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    ASTERISK_ARI_URL: z.url().default("http://127.0.0.1:8088"),
    ASTERISK_ARI_USER: z.string().trim().min(1).default("system112"),
    ASTERISK_ARI_PASSWORD: z.string().optional(),
    ASTERISK_ARI_APP: z.string().trim().min(1).default("crew-handoff"),
    /** Каталог звуков, общий с Asterisk: сюда кладутся реплики нарядов. */
    TELEPHONY_SOUNDS_DIR: z
      .string()
      .trim()
      .min(1)
      .default("./telephony-sounds"),
  })
  .superRefine((value, context) => {
    if (value.TELEPHONY_ENABLED && !value.ASTERISK_ARI_PASSWORD?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["ASTERISK_ARI_PASSWORD"],
        message: "ASTERISK_ARI_PASSWORD is required when telephony is enabled",
      });
    }
  });

export type TelephonyEnvironment = z.input<typeof TelephonyConfigSchema>;

export const TELEPHONY_ENVIRONMENT_KEYS = [
  "TELEPHONY_ENABLED",
  "ASTERISK_ARI_URL",
  "ASTERISK_ARI_USER",
  "ASTERISK_ARI_PASSWORD",
  "ASTERISK_ARI_APP",
  "TELEPHONY_SOUNDS_DIR",
] as const satisfies readonly (keyof TelephonyEnvironment)[];

export interface TelephonyConfig {
  readonly enabled: boolean;
  readonly ari: {
    readonly url: string;
    readonly user: string;
    readonly password: string;
    readonly app: string;
  };
  readonly soundsDir: string;
}

export const TELEPHONY_CONFIG = Symbol("TELEPHONY_CONFIG");

export const parseTelephonyConfig = (
  environment: Partial<Record<keyof TelephonyEnvironment, unknown>>,
): TelephonyConfig => {
  const parsed = TelephonyConfigSchema.parse(environment);

  return {
    enabled: parsed.TELEPHONY_ENABLED,
    ari: {
      url: parsed.ASTERISK_ARI_URL.replace(/\/+$/u, ""),
      user: parsed.ASTERISK_ARI_USER,
      password: parsed.ASTERISK_ARI_PASSWORD ?? "",
      app: parsed.ASTERISK_ARI_APP,
    },
    soundsDir: parsed.TELEPHONY_SOUNDS_DIR,
  };
};
