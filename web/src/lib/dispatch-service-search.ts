import {
  DISPATCH_SERVICES,
  DISPATCH_SERVICE_LABELS,
  type DispatchService,
} from "../contracts/incident";

/** Поиск в справочнике служб: пользователь вводит и подпись, и номер. */
export function findDispatchServices(
  query: string,
  excluded: readonly DispatchService[] = [],
): DispatchService[] {
  const needle = query.trim().toLocaleLowerCase("ru-RU");

  return DISPATCH_SERVICES.filter((service) => {
    if (excluded.includes(service)) return false;
    if (!needle) return true;

    const haystack = `${DISPATCH_SERVICE_LABELS[service]} ${service}`
      .toLocaleLowerCase("ru-RU")
      .replaceAll("-", " ");

    return haystack.includes(needle.replaceAll("-", " "));
  });
}

/** Переключает службу в черновике диалога, не затрагивая обязательные. */
export function toggleDispatchServiceSelection(
  selected: readonly DispatchService[],
  service: DispatchService,
  locked: readonly DispatchService[] = [],
): DispatchService[] {
  if (locked.includes(service)) return [...selected];

  const next = new Set(selected);
  if (next.has(service)) next.delete(service);
  else next.add(service);
  return DISPATCH_SERVICES.filter((item) => next.has(item));
}

/**
 * Возвращает службы, которые нужно переключить, чтобы применить черновик.
 * Порядок справочника делает результат стабильным для UI и тестов.
 */
export function dispatchServiceSelectionChanges(
  current: readonly DispatchService[],
  next: readonly DispatchService[],
  locked: readonly DispatchService[] = [],
): DispatchService[] {
  const currentSet = new Set(current);
  const nextSet = new Set(next);

  return DISPATCH_SERVICES.filter(
    (service) =>
      !locked.includes(service) &&
      currentSet.has(service) !== nextSet.has(service),
  );
}
