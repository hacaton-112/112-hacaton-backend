import { z } from "zod";

const EnvSchema = z.object({
  VITE_API_URL: z.url().optional(),
  VITE_WS_URL: z.url().optional(),
  /** Стиль подложки MapLibre. По умолчанию — тёмная тема CARTO под тему приложения. */
  VITE_MAP_STYLE_URL: z
    .url()
    .default(
      "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    ),
});

const parsed = EnvSchema.safeParse(import.meta.env);

if (!parsed.success) {
  throw new Error(
    `Некорректные переменные окружения: ${z.prettifyError(parsed.error)}`,
  );
}

const stripTrailingSlash = (url: string) => url.replace(/\/+$/, "");
const locationOrigin =
  typeof window === "undefined"
    ? "http://127.0.0.1:3000"
    : window.location.origin;
const apiUrl = stripTrailingSlash(parsed.data.VITE_API_URL ?? locationOrigin);

export const env = {
  apiUrl,
  /** По умолчанию голосовой сокет использует тот же origin и автоматически wss под HTTPS. */
  wsUrl: stripTrailingSlash(
    parsed.data.VITE_WS_URL ?? apiUrl.replace(/^http/, "ws"),
  ),
  mapStyleUrl: parsed.data.VITE_MAP_STYLE_URL,
} as const;
