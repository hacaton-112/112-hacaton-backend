import { z } from "zod";

const EXTENSION = /^\d{2,6}$/u;

const WebRtcWorkstationsSchema = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((extension) => extension.trim())
      .filter(Boolean),
  )
  .refine(
    (extensions) =>
      extensions.every((extension) => EXTENSION.test(extension)) &&
      new Set(extensions).size === extensions.length,
    "ASTERISK_WEBRTC_WORKSTATIONS must contain unique 2-6 digit extensions",
  );

const WebSocketUrlSchema = z
  .url()
  .refine(
    (value) => ["ws:", "wss:"].includes(new URL(value).protocol),
    "ASTERISK_WEBRTC_WS_URL must use ws or wss",
  );

/**
 * Настройка учебной IP-телефонии.
 *
 * Выключена по умолчанию: прямой браузерный звонок ДДС не зависит от Asterisk.
 * Флаг включает только дополнительный SIP/ARI-адаптер. Включение без адреса и
 * пароля ARI — ошибка запуска, а не тихо не работающие аппаратные телефоны.
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
    /** Имя backend, доступное из контейнера Asterisk для RTP externalMedia. */
    ASTERISK_MEDIA_HOST: z
      .string()
      .trim()
      .min(1)
      .default("host.docker.internal"),
    /** Локальный интерфейс для динамических UDP-портов RTP. */
    ASTERISK_MEDIA_BIND_HOST: z.string().trim().min(1).default("0.0.0.0"),
    ASTERISK_WEBRTC_WORKSTATIONS: WebRtcWorkstationsSchema,
    ASTERISK_WEBRTC_WS_URL: WebSocketUrlSchema.default(
      "ws://127.0.0.1:8088/ws",
    ),
    ASTERISK_WEBRTC_SIP_DOMAIN: z.string().trim().min(1).default("localhost"),
    ASTERISK_SIP_PASSWORD: z.string().optional(),
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
    if (
      value.ASTERISK_WEBRTC_WORKSTATIONS.length > 0 &&
      !value.TELEPHONY_ENABLED
    ) {
      context.addIssue({
        code: "custom",
        path: ["ASTERISK_WEBRTC_WORKSTATIONS"],
        message: "Browser phones require TELEPHONY_ENABLED=true",
      });
    }
    if (
      value.ASTERISK_WEBRTC_WORKSTATIONS.length > 0 &&
      !value.ASTERISK_SIP_PASSWORD?.trim()
    ) {
      context.addIssue({
        code: "custom",
        path: ["ASTERISK_SIP_PASSWORD"],
        message: "ASTERISK_SIP_PASSWORD is required for browser phones",
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
  "ASTERISK_MEDIA_HOST",
  "ASTERISK_MEDIA_BIND_HOST",
  "ASTERISK_WEBRTC_WORKSTATIONS",
  "ASTERISK_WEBRTC_WS_URL",
  "ASTERISK_WEBRTC_SIP_DOMAIN",
  "ASTERISK_SIP_PASSWORD",
  "TELEPHONY_SOUNDS_DIR",
] as const satisfies readonly (keyof TelephonyEnvironment)[];

export interface TelephonyConfig {
  readonly enabled: boolean;
  readonly ari: {
    readonly url: string;
    readonly user: string;
    readonly password: string;
    readonly app: string;
    readonly mediaHost: string;
    readonly mediaBindHost: string;
  };
  readonly soundsDir: string;
  readonly browserPhone: {
    readonly enabled: boolean;
    readonly websocketUrl: string;
    readonly sipDomain: string;
    readonly extensions: readonly string[];
    readonly passwordMaster: string;
  };
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
      mediaHost: parsed.ASTERISK_MEDIA_HOST,
      mediaBindHost: parsed.ASTERISK_MEDIA_BIND_HOST,
    },
    soundsDir: parsed.TELEPHONY_SOUNDS_DIR,
    browserPhone: {
      enabled: parsed.ASTERISK_WEBRTC_WORKSTATIONS.length > 0,
      websocketUrl: parsed.ASTERISK_WEBRTC_WS_URL,
      sipDomain: parsed.ASTERISK_WEBRTC_SIP_DOMAIN,
      extensions: parsed.ASTERISK_WEBRTC_WORKSTATIONS,
      passwordMaster: parsed.ASTERISK_SIP_PASSWORD ?? "",
    },
  };
};
