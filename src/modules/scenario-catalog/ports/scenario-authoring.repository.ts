import type { ScenarioSeed } from "@/modules/scenario-engine/domain/scenario-seed.schema";

export interface PublishScenarioInput {
  readonly scenario: ScenarioSeed;
  readonly authorId: string;
  readonly authoringSource: "manual" | "assistant";
  readonly authoringPrompt?: string;
}

export interface PublishedScenario {
  readonly scenarioId: string;
  readonly scenarioVersionId: string;
  readonly code: string;
  readonly title: string;
  readonly version: number;
  readonly status: "published";
  readonly publishedAt: string;
}

export type ScenarioAuthoringConflict = "scenario-code" | "persona-code";

export class ScenarioAuthoringConflictError extends Error {
  constructor(public readonly conflict: ScenarioAuthoringConflict) {
    super(`Scenario authoring conflict: ${conflict}`);
    this.name = ScenarioAuthoringConflictError.name;
  }
}

export interface ScenarioAuthoringRepository {
  publish(input: PublishScenarioInput): Promise<PublishedScenario>;
}

export const SCENARIO_AUTHORING_REPOSITORY = Symbol(
  "SCENARIO_AUTHORING_REPOSITORY",
);
