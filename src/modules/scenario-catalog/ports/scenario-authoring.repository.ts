import type { AuthoringSource } from "@/drizzle/schema";
import type { ScenarioSeed } from "@/modules/scenario-engine/domain/scenario-seed.schema";

export interface PublishScenarioInput {
  readonly scenario: ScenarioSeed;
  readonly authorId: string;
  readonly authoringSource: "manual" | "assistant";
  readonly authoringPrompt?: string;
}

/** Правка опубликованного сценария: всегда новая версия поверх известной. */
export interface PublishScenarioVersionInput extends PublishScenarioInput {
  readonly scenarioId: string;
  /** Версия, которую преподаватель открыл в редакторе. */
  readonly baseVersionId: string;
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

/** Опубликованная версия целиком — в той форме, которую принимает публикация. */
export interface EditableScenarioVersion {
  readonly scenarioId: string;
  readonly scenarioVersionId: string;
  readonly version: number;
  /** Опубликована ли после неё более новая версия. */
  readonly isLatest: boolean;
  readonly publishedAt: string;
  readonly authoringSource: AuthoringSource;
  readonly scenario: ScenarioSeed;
}

export type ScenarioAuthoringConflict =
  | "scenario-code"
  | "persona-code"
  /** Код — личность сценария: правка его не меняет. */
  | "code-changed"
  /** Пока преподаватель правил, кто-то опубликовал более новую версию. */
  | "stale-version";

export class ScenarioAuthoringConflictError extends Error {
  constructor(public readonly conflict: ScenarioAuthoringConflict) {
    super(`Scenario authoring conflict: ${conflict}`);
    this.name = ScenarioAuthoringConflictError.name;
  }
}

export class ScenarioNotFoundError extends Error {
  constructor() {
    super("The scenario does not exist");
    this.name = ScenarioNotFoundError.name;
  }
}

export interface ScenarioAuthoringRepository {
  publish(input: PublishScenarioInput): Promise<PublishedScenario>;

  /** `null`, если версии нет или она не опубликована. */
  loadVersion(
    scenarioVersionId: string,
  ): Promise<EditableScenarioVersion | null>;

  publishVersion(
    input: PublishScenarioVersionInput,
  ): Promise<PublishedScenario>;
}

export const SCENARIO_AUTHORING_REPOSITORY = Symbol(
  "SCENARIO_AUTHORING_REPOSITORY",
);
