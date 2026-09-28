/**
 * Подпись значения для экрана.
 *
 * Код из базы («accepted», «road_accident») пользователю ничего не говорит, а
 * новое значение на сервере может появиться раньше, чем подпись к нему в
 * клиенте. Незнакомое значение показываем нейтральной подписью, а не кодом.
 */
export const labelFor = (
  labels: Readonly<Record<string, string>>,
  value: string | null | undefined,
  fallback = "—",
): string => (value ? (labels[value] ?? fallback) : fallback);
