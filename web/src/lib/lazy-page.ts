import { lazy, type ComponentType } from "react";

const RELOADED_KEY = "app:chunk-reloaded";

/**
 * Файл раздела мог исчезнуть: после выкатки имена файлов сборки меняются, а
 * открытая вкладка помнит старые. Вместо экрана ошибки страница один раз
 * перезагружается и берёт свежую сборку; флаг в сессии защищает от петли.
 */
const reloadOnce = (): Promise<never> => {
  let reloaded = true;
  try {
    reloaded = sessionStorage.getItem(RELOADED_KEY) === "1";
    if (!reloaded) sessionStorage.setItem(RELOADED_KEY, "1");
  } catch {
    // Приватное окно: перезагружаем без защиты от повтора.
    reloaded = false;
  }
  if (!reloaded) window.location.reload();
  // Промис не разрешается: страница уже уходит на перезагрузку.
  return new Promise<never>(() => {});
};

export const clearChunkReloadMark = () => {
  try {
    sessionStorage.removeItem(RELOADED_KEY);
  } catch {
    // Хранилище недоступно — помечать нечего.
  }
};

export function lazyImport<T extends ComponentType<unknown>>(
  load: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    load().catch((error: unknown) => {
      console.error("Не удалось загрузить раздел:", error);
      return reloadOnce();
    }),
  );
}
