import type { ClassifierRouting } from "../contracts/classifier";
import {
  DISPATCH_SERVICES,
  type DispatchService,
  type IncidentCard,
} from "../contracts/incident";

const KNOWN_DISPATCH_SERVICES = new Set<string>(DISPATCH_SERVICES);

const CLASSIFIER_SERVICE_CODES: Readonly<Record<string, DispatchService>> = {
  fire: "dds_01",
  police: "dds_02",
  ambulance: "dds_03",
  gas: "dds_04",
};

const classifierServiceCode = (value: string): DispatchService | undefined => {
  const normalized = value.trim().toLocaleLowerCase("ru-RU");
  if (KNOWN_DISPATCH_SERVICES.has(normalized)) {
    return normalized as DispatchService;
  }
  const numbered = /^(?:dds[-_ ]?)?0?([1-4])$/.exec(normalized);
  if (numbered) return `dds_0${numbered[1]}` as DispatchService;
  return CLASSIFIER_SERVICE_CODES[normalized.replace(/^svc_/, "")];
};

const classifierServiceName = (value: string): DispatchService | undefined => {
  const normalized = value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").trim();

  if (/пожар|мчс/.test(normalized)) return "dds_01";
  if (/полици|мвд/.test(normalized)) return "dds_02";
  if (/скор|медицин|здравоохран/.test(normalized)) return "dds_03";
  if (/газ/.test(normalized)) return "dds_04";
  if (/жкх|жилищ|коммунал/.test(normalized)) return "zhkh";
  if (/антитеррор/.test(normalized)) return "antiterror";
  if (/еддс/.test(normalized)) return "eddc";
  if (/уадит/.test(normalized)) return "uadit";
  if (/росгвард/.test(normalized)) return "rosgvardia";
  if (/цукс/.test(normalized)) return "cuks";
  if (/аварийно.?спасатель/.test(normalized)) return "ass";
  if (/лпц/.test(normalized)) return "lpc";
  return undefined;
};

export function getClassifierDispatchServices(
  routing?: ClassifierRouting | null,
): DispatchService[] {
  if (!routing) return [];

  return [
    ...new Set(
      [
        routing.mainServiceCode
          ? classifierServiceCode(routing.mainServiceCode)
          : undefined,
        ...routing.requiredServices.map(
          (service) =>
            classifierServiceCode(service.code) ??
            classifierServiceName(service.name),
        ),
      ].filter((service): service is DispatchService => service !== undefined),
    ),
  ];
}

/**
 * Поля, без которых backend не создаст доставки ДДС.
 *
 * Проверка намеренно повторяет `buildDdsIncidentSnapshot`: клиент объясняет
 * оператору причину отказа, а окончательное решение всё равно остаётся за
 * backend.
 */
export function getMissingIncidentCardFields(card?: IncidentCard): string[] {
  if (!card) return ["карточка ещё загружается"];

  return [
    ...(!card.addressText?.trim() ? ["адрес"] : []),
    ...(card.latitude === null || card.longitude === null
      ? ["точка на карте"]
      : []),
    ...(!card.incidentType?.trim() ? ["тип происшествия"] : []),
    ...(!card.classifierRouting ? ["классификация происшествия"] : []),
    ...(!card.description?.trim() ? ["описание со слов заявителя"] : []),
    ...(card.services.length === 0 &&
    getClassifierDispatchServices(card.classifierRouting).length === 0
      ? ["служба ДДС"]
      : []),
  ];
}
