import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNotNull } from "drizzle-orm";

import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import { scenarios, scenarioVersions } from "@/drizzle/schema";

import { latestVersionPerScenario } from "../domain/latest-version-per-scenario";
import type { ScenarioSummary } from "../dto/scenario-summary.dto";
import type { ScenarioCatalog } from "../ports/scenario-catalog.port";

@Injectable()
export class DrizzleScenarioCatalog implements ScenarioCatalog {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService["db"]) {}

  async listPublished(): Promise<readonly ScenarioSummary[]> {
    const rows = await this.db
      .select({
        scenarioId: scenarios.id,
        scenarioVersionId: scenarioVersions.id,
        code: scenarios.code,
        title: scenarios.title,
        summary: scenarios.summary,
        category: scenarios.category,
        difficulty: scenarios.difficulty,
        answerNormSeconds: scenarioVersions.answerNormSeconds,
        expectedDurationSeconds: scenarioVersions.expectedDurationSeconds,
        version: scenarioVersions.version,
      })
      .from(scenarioVersions)
      .innerJoin(scenarios, eq(scenarioVersions.scenarioId, scenarios.id))
      .where(
        and(
          eq(scenarios.status, "published"),
          isNotNull(scenarioVersions.publishedAt),
        ),
      )
      .orderBy(scenarios.code, desc(scenarioVersions.version));

    // Из нескольких опубликованных версий одного сценария оператору нужна
    // последняя: старые остаются только для разбора прошедших занятий.
    return latestVersionPerScenario(rows).map(
      ({ scenarioId: _, ...row }) => row,
    );
  }
}
