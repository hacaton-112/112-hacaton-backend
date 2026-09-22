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
