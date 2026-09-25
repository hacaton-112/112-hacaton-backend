/**
 * Идентификатор активной учебной сессии переживает перезапуск окна оператора:
 * по нему клиент поднимает тот же звонок после обрыва связи или рестарта
 * backend, пока не истекло окно восстановления.
 */
const ACTIVE_CALL_STORAGE_KEY = "system112.activeTrainingSession";

/**
 * Восстанавливать можно только свой звонок. Ключ помнит оператора, иначе
 * следующий вошедший на этой машине попробовал бы поднять чужую сессию и
 * получил бы отказ уже от backend — с пустым окном вместо рабочего места.
 */
export function readActiveTrainingSession(
  operatorId: string | undefined,
): string | null {
  if (!operatorId) return null;

  const stored = localStorage.getItem(ACTIVE_CALL_STORAGE_KEY);
  if (!stored) return null;

  const separator = stored.indexOf(":");
  if (separator === -1) return null;

  return stored.slice(0, separator) === operatorId
    ? stored.slice(separator + 1)
    : null;
}

export function writeActiveTrainingSession(
  operatorId: string | undefined,
  sessionId: string,
): void {
  if (!operatorId) return;

  localStorage.setItem(ACTIVE_CALL_STORAGE_KEY, `${operatorId}:${sessionId}`);
}

export function clearActiveTrainingSession(): void {
  localStorage.removeItem(ACTIVE_CALL_STORAGE_KEY);
}
