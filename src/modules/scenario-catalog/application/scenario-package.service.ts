import { Inject, Injectable } from "@nestjs/common";

import {
  buildScenarioPackage,
  parseScenarioPackage,
} from "../domain/scenario-package";
import type { ScenarioImportReport } from "../dto/scenario-package.dto";
import {
  SCENARIO_AUTHORING_REPOSITORY,
  type ScenarioAuthoringRepository,
} from "../ports/scenario-authoring.repository";
import {
  SCENARIO_CATALOG,
  type ScenarioCatalog,
} from "../ports/scenario-catalog.port";

@Injectable()
export class ScenarioPackageService {
  constructor(
    @Inject(SCENARIO_CATALOG) private readonly catalog: ScenarioCatalog,
    @Inject(SCENARIO_AUTHORING_REPOSITORY)
    private readonly repository: ScenarioAuthoringRepository,
  ) {}

  async export(selectedVersionIds: readonly string[]) {
    const selected = new Set(selectedVersionIds);
    const latest = await this.catalog.listPublished();
    const rows =
      selected.size === 0
        ? latest
        : latest.filter(({ scenarioVersionId }) =>
            selected.has(scenarioVersionId),
          );
    const versions = await Promise.all(
      rows.map(({ scenarioVersionId }) =>
        this.repository.loadVersion(scenarioVersionId),
      ),
    );
    return buildScenarioPackage(
      versions.flatMap((version) => (version ? [version.scenario] : [])),
    );
  }

  async import(
    input: unknown,
    dryRun: boolean,
    actorId: string,
  ): Promise<ScenarioImportReport> {
    const parsed = parseScenarioPackage(input);
    const accepted = await this.repository.importMany({
      scenarios: parsed.scenarios,
      actorId,
      dryRun,
    });
    const entries = [
      ...accepted.map((entry) => ({ ...entry, reason: null })),
      ...parsed.issues.map((issue) => ({
        code: issue.code,
        outcome: "rejected" as const,
        reason: issue.reason,
      })),
    ];
    return {
      dryRun,
      accepted: accepted.length,
      rejected: parsed.issues.length,
      entries,
    };
  }
}
