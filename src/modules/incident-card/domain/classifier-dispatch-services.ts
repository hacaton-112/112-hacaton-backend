import {
  DISPATCH_SERVICES,
  type ClassifierRoutingSnapshot,
  type DispatchService,
} from "@/drizzle/schema";

const KNOWN_DISPATCH_SERVICES = new Set<string>(DISPATCH_SERVICES);

/*
 * Classifier codes and card buttons are separate dictionaries. These aliases
 * cover the four emergency services used by scenarios; exact card codes are
 * accepted below for municipal and specialist routes.
 */
const BY_EMERGENCY_SERVICE: Readonly<Record<string, DispatchService>> = {
  fire: "dds_01",
  police: "dds_02",
  ambulance: "dds_03",
  gas: "dds_04",
};

const normalizeCode = (value: string): DispatchService | null => {
  const normalized = value.trim().toLocaleLowerCase("ru-RU");
  if (KNOWN_DISPATCH_SERVICES.has(normalized)) {
    return normalized as DispatchService;
  }
  const numbered = /^(?:dds[-_ ]?)?0?([1-4])$/.exec(normalized);
  if (numbered) return `dds_0${numbered[1]}` as DispatchService;

  return BY_EMERGENCY_SERVICE[normalized.replace(/^svc_/, "")] ?? null;
};

const normalizeName = (value: string): DispatchService | null => {
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
  return null;
};

/**
 * Переводит маршрутизацию классификатора в кнопки ДДС карточки.
 *
 * Основная служба приходит кодом 01–04, а импортированные дополнительные
 * маршруты — стабильным техническим кодом и человекочитаемым названием.
 */
export function classifierDispatchServices(
  routing: ClassifierRoutingSnapshot,
): DispatchService[] {
  const candidates = [
    routing.mainServiceCode ? normalizeCode(routing.mainServiceCode) : null,
    ...routing.requiredServices.map(
      (service) => normalizeCode(service.code) ?? normalizeName(service.name),
    ),
  ];

  return [
    ...new Set(
      candidates.filter(
        (service): service is DispatchService => service !== null,
      ),
    ),
  ];
}
