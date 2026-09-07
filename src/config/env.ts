import { z } from "zod";

const EnvSchema = z.object({
  VITE_API_URL: z.url().default("http://127.0.0.1:3000"),
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

export const env = {
  apiUrl: stripTrailingSlash(parsed.data.VITE_API_URL),
  /** Same host over ws:// — the ASR and voice pipeline endpoints are WebSockets. */
  wsUrl: stripTrailingSlash(parsed.data.VITE_API_URL).replace(/^http/, "ws"),
  mapStyleUrl: parsed.data.VITE_MAP_STYLE_URL,
} as const;
