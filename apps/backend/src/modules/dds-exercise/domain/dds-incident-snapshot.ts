import type {
  ClassifierRoutingSnapshot,
  DispatchService,
  ScenarioCategory,
} from "@/drizzle/schema";

import type { DdsCardSnapshot } from "../dto/dds-exercise.dto";

export interface DdsIncidentSource {
  readonly scenarioCode: string;
  readonly scenarioTitle: string;
  readonly scenarioSummary: string;
  readonly scenarioCategory: ScenarioCategory;
  readonly callerAnonymous: boolean;
  readonly callerLastName: string | null;
  readonly callerFirstName: string | null;
  readonly callerMiddleName: string | null;
  readonly callerPhone: string | null;
  readonly addressText: string | null;
  readonly latitude: string | null;
  readonly longitude: string | null;
  readonly incidentType: string | null;
  readonly classifierRouting: ClassifierRoutingSnapshot | null;
  readonly description: string | null;
  readonly victimsTotal: number | null;
  readonly services: readonly DispatchService[];
}

export type BuiltDdsIncidentSnapshot =
  | {
      readonly ok: true;
      readonly snapshot: DdsCardSnapshot;
      readonly services: readonly DispatchService[];
    }
  | { readonly ok: false; readonly missingFields: readonly string[] };

const clean = (value: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/**
 * Builds the immutable DDS payload from what the operator actually entered.
 * Scenario fields are used only for the card heading, never instead of the
 * operator's address, type, description, routing, or victims count.
 */
export function buildDdsIncidentSnapshot(
  source: DdsIncidentSource,
): BuiltDdsIncidentSnapshot {
  const addressText = clean(source.addressText);
  const incidentType = clean(source.incidentType);
  const description = clean(source.description);
  const services = [...new Set(source.services)];
  const missingFields = [
    ...(!addressText ? ["addressText"] : []),
    ...(source.latitude === null ? ["latitude"] : []),
    ...(source.longitude === null ? ["longitude"] : []),
    ...(!incidentType ? ["incidentType"] : []),
    ...(!source.classifierRouting ? ["classifierRouting"] : []),
    ...(!description ? ["description"] : []),
    ...(services.length === 0 ? ["services"] : []),
  ];

  if (missingFields.length > 0) return { ok: false, missingFields };

  const callerName = source.callerAnonymous
    ? "Анонимный заявитель"
    : clean(
        [source.callerLastName, source.callerFirstName, source.callerMiddleName]
          .filter(Boolean)
          .join(" "),
      );

  return {
    ok: true,
    services,
    snapshot: {
      scenarioCode: source.scenarioCode,
      title: source.scenarioTitle,
      summary: source.scenarioSummary,
      category: source.scenarioCategory,
      addressText: addressText!,
      latitude: Number(source.latitude),
      longitude: Number(source.longitude),
      callerName: callerName?.slice(0, 200) ?? null,
      callerPhone: clean(source.callerPhone),
      incidentType: incidentType!,
      description: description!,
      victimsTotal: source.victimsTotal,
      services,
    },
  };
}
