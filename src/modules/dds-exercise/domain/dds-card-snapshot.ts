import type {
  DispatchService,
  EmergencyService,
  IncidentCardField,
  ScenarioCategory,
} from "@/drizzle/schema";

import type { DdsCardSnapshot } from "../dto/dds-exercise.dto";
import type { DdsScenarioSource } from "../ports/dds-exercise.store.port";

const SERVICE_CODES: Record<EmergencyService, DispatchService> = {
  fire: "dds_01",
  police: "dds_02",
  ambulance: "dds_03",
  gas: "dds_04",
};

const CATEGORY_FALLBACK: Record<
  ScenarioCategory,
  EmergencyService | undefined
> = {
  fire: "fire",
  road_accident: "police",
  medical: "ambulance",
  criminal: "police",
  gas_leak: "gas",
  other: undefined,
};

const ADDRESS_KEYS = [
  "city",
  "settlement",
  "street",
  "house",
  "building",
  "entrance",
  "floor",
  "apartment",
  "object",
] as const;

const fieldMap = (
  fields: DdsScenarioSource["referenceFields"],
): ReadonlyMap<IncidentCardField, string> =>
  new Map(fields.map((field) => [field.field, field.expectedValue]));

const formatAddress = (source: DdsScenarioSource): string => {
  const ordered = ADDRESS_KEYS.map((key) => source.exactAddress[key])
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim());
  const used = new Set(ADDRESS_KEYS);
  const remaining = Object.entries(source.exactAddress)
    .filter(
      ([key, value]) =>
        !used.has(key as (typeof ADDRESS_KEYS)[number]) &&
        Boolean(value?.trim()),
    )
    .map(([, value]) => value.trim());

  return [...ordered, ...remaining].join(", ") || source.locatorLabel;
};

const parseVictimsTotal = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const match = value.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export interface BuiltDdsCard {
  readonly addressedService: DispatchService;
  readonly snapshot: DdsCardSnapshot;
}

export function buildDdsCardSnapshot(
  source: DdsScenarioSource,
): BuiltDdsCard | null {
  const expected =
    source.expectedServices.length > 0
      ? source.expectedServices
      : CATEGORY_FALLBACK[source.category]
        ? [CATEGORY_FALLBACK[source.category]]
        : [];
  const services = expected
    .filter((service): service is EmergencyService => service !== undefined)
    .map((service) => SERVICE_CODES[service]);

  if (services.length === 0) return null;

  const references = fieldMap(source.referenceFields);

  return {
    addressedService: services[0],
    snapshot: {
      scenarioCode: source.code,
      title: source.title,
      summary: source.summary,
      category: source.category,
      addressText: formatAddress(source),
      latitude: source.exactLatitude,
      longitude: source.exactLongitude,
      callerName: references.get("caller_name") ?? source.callerName ?? null,
      callerPhone:
        references.get("caller_phone") ?? source.callerNumber ?? null,
      incidentType: references.get("category") ?? source.title,
      description:
        references.get("dispatcher_notes") ??
        references.get("clarification") ??
        source.summary,
      victimsTotal: parseVictimsTotal(references.get("victims_total")),
      services: [...new Set(services)],
    },
  };
}
