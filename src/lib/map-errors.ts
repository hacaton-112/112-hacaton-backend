/**
 * Что считать поломкой карты.
 *
 * Детальные тайлы есть только по Москве и области, поэтому за их пределами
 * сервер честно отвечает 404 на каждый запрошенный квадрат. Это обычное
 * состояние карты, а не сбой: подложка там просто заканчивается. Фатальны
 * только ошибки, из-за которых карта не может отрисоваться вообще — не
 * загрузился стиль, не отдан список тайлов, не пришли шрифты.
 */
const MISSING = new Set([204, 404]);

export function isMissingTileError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  return typeof status === "number" && MISSING.has(status);
}

/**
 * Готов ли браузер рисовать карту.
 *
 * MapLibre рисует через WebGL. Если контекст недоступен (удалённый рабочий
 * стол, отключённое аппаратное ускорение, старый драйвер), карта загружает
 * стиль и метаданные, но не запрашивает ни одного тайла и остаётся чёрной —
 * без единой ошибки. Проверка заранее позволяет сказать об этом прямо.
 */
export function hasWebGl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}

/** Понятная причина, по которой карта не отрисовалась. */
export const mapFailureText = (error: unknown): string => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return message ? `Карта не загрузилась: ${message}` : "Карта не загрузилась";
};
