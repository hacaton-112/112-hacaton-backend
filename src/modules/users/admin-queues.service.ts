import { Inject, Injectable } from "@nestjs/common";

import { BackgroundQueueScheduler } from "@/core/background-queue/background-queue.scheduler";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  ddsCardReferences,
  ddsLessonInsights,
  ddsTextEvaluations,
  scenarioGenerationJobs,
} from "@/drizzle/schema";

@Injectable()
export class AdminQueuesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService["db"],
    private readonly scheduler: BackgroundQueueScheduler,
  ) {}

  async get() {
    const [scenarios, references, evaluations, insights] = await Promise.all([
      this.db.select().from(scenarioGenerationJobs),
      this.db.select().from(ddsCardReferences),
      this.db.select().from(ddsTextEvaluations),
      this.db.select().from(ddsLessonInsights),
    ]);
    const now = Date.now();
    const rows = [
      this.summary(
        "scenario_generation",
        scenarios.map((row) => ({
          status:
            row.status === "queued"
              ? "queued"
              : row.status === "running"
                ? "processing"
                : row.status,
          createdAt: row.createdAt,
        })),
      ),
      this.summary(
        "dds_reference_generation",
        references.map((row) => ({
          status: row.jobStatus,
          createdAt: row.createdAt,
        })),
      ),
      this.summary(
        "dds_text_evaluation",
        evaluations.map((row) => ({
          status:
            row.status === "pending" &&
            row.leaseUntil &&
            row.leaseUntil.getTime() > now
              ? "processing"
              : row.status === "pending"
                ? "queued"
                : row.status,
          createdAt: row.createdAt,
        })),
      ),
      this.summary(
        "dds_insights",
        insights.map((row) => ({
          status: row.status,
          createdAt: row.createdAt,
        })),
      ),
    ];
    return { queues: rows };
  }

  private summary(
    name:
      | "scenario_generation"
      | "dds_reference_generation"
      | "dds_text_evaluation"
      | "dds_insights",
    rows: { status: string; createdAt: Date }[],
  ) {
    const active = rows.filter(
      ({ status }) =>
        status === "queued" || status === "pending" || status === "processing",
    );
    const oldest = active.reduce<Date | null>(
      (value, row) => (!value || row.createdAt < value ? row.createdAt : value),
      null,
    );
    return {
      name,
      queued: rows.filter(
        ({ status }) => status === "queued" || status === "pending",
      ).length,
      processing: rows.filter(({ status }) => status === "processing").length,
      failed: rows.filter(({ status }) => status === "failed").length,
      oldestAt: oldest?.toISOString() ?? null,
      enabled: this.scheduler.isEnabled(name),
    };
  }
}
