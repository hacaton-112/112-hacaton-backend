import { ScenarioSeedSchema } from "../../contracts/scenario-authoring";

export interface PreparationSelection {
  id: string | null;
  snapshotKey: string;
  ready: boolean;
}
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
};
export const scenarioPreparationKey = (scenario: unknown): string | null => {
  const parsed = ScenarioSeedSchema.safeParse(scenario);
  return parsed.success ? JSON.stringify(canonical(parsed.data)) : null;
};
export const preparationCanPublish = (
  selection: PreparationSelection | null,
  scenario: unknown,
): boolean =>
  selection === null ||
  Boolean(
    selection.id &&
    selection.ready &&
    selection.snapshotKey === scenarioPreparationKey(scenario),
  );
