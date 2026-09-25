import { Inject, Injectable } from "@nestjs/common";
import { and, count, gt, isNotNull, min } from "drizzle-orm";

import { BackgroundQueueScheduler } from "@/core/background-queue/background-queue.scheduler";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  ddsCardReferences,
  ddsLessonInsights,
  ddsTextEvaluations,
  scenarioGenerationJobs,
} from "@/drizzle/schema";

export type QueueName =
  | "scenario_generation"
  | "dds_reference_generation"
  | "dds_text_evaluation"
  | "dds_insights";

/** Сколько заданий очереди в одном состоянии и когда поставлено самое старое из них. */
export interface QueueStateRow {
  status: string;
  total: number;
  oldestAt: Date | null;
}

const QUEUED = ["queued", "pending"];
const PROCESSING = ["processing", "running"];

export function summarizeQueue(
  name: QueueName,
  rows: readonly QueueStateRow[],
) {
  const sum = (statuses: readonly string[]) =>
    rows.reduce(
      (total, row) =>
        statuses.includes(row.status) ? total + row.total : total,
      0,
    );
  // Возраст очереди показывают только незакрытые задания.
  const oldest = rows
    .filter(
      (row) =>
        row.oldestAt !== null &&
        row.total > 0 &&
        [...QUEUED, ...PROCESSING].includes(row.status),
    )
    .reduce<Date | null>(
      (value, row) => (!value || row.oldestAt! < value ? row.oldestAt! : value),
      null,
    );
  return {
    name,
    queued: sum(QUEUED),
    processing: sum(PROCESSING),
    failed: sum(["failed"]),
    oldestAt: oldest?.toISOString() ?? null,
  };
}

/** Задания с живой арендой идут прямо сейчас, хотя в таблице остаются ожидающими. */
export function splitLeased(
  rows: readonly QueueStateRow[],
  running: number,
): QueueStateRow[] {
  if (running === 0) return [...rows];
  const pending = rows.find((row) => row.status === "pending");
  return [
    ...rows.map((row) =>
      row.status === "pending"
        ? { ...row, total: Math.max(0, row.total - running) }
        : row,
    ),
    {
      status: "processing",
      total: running,
      oldestAt: pending?.oldestAt ?? null,
    },
  ];
}

const toRows = (
  rows: readonly { status: string; total: number; oldestAt: Date | null }[],
): QueueStateRow[] =>
  rows.map(({ status, total, oldestAt }) => ({
    status,
    total: Number(total),
    oldestAt,
  }));

@Injectable()
export class AdminQueuesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService["db"],
    private readonly scheduler: BackgroundQueueScheduler,
  ) {}

  async get() {
    const now = new Date();
    const [scenarios, references, evaluations, leased, insights] =
      await Promise.all([
        this.db
          .select({
            status: scenarioGenerationJobs.status,
            total: count(),
            oldestAt: min(scenarioGenerationJobs.createdAt),
          })
          .from(scenarioGenerationJobs)
          .groupBy(scenarioGenerationJobs.status),
        this.db
          .select({
            status: ddsCardReferences.jobStatus,
            total: count(),
            oldestAt: min(ddsCardReferences.createdAt),
          })
          .from(ddsCardReferences)
          .groupBy(ddsCardReferences.jobStatus),
        this.db
          .select({
            status: ddsTextEvaluations.status,
            total: count(),
            oldestAt: min(ddsTextEvaluations.createdAt),
          })
          .from(ddsTextEvaluations)
          .groupBy(ddsTextEvaluations.status),
        this.db
          .select({ total: count() })
          .from(ddsTextEvaluations)
          .where(
            and(
              isNotNull(ddsTextEvaluations.leaseOwner),
              gt(ddsTextEvaluations.leaseUntil, now),
            ),
          ),
        this.db
          .select({
            status: ddsLessonInsights.status,
            total: count(),
            oldestAt: min(ddsLessonInsights.createdAt),
          })
          .from(ddsLessonInsights)
          .groupBy(ddsLessonInsights.status),
      ]);
    const queues = [
      summarizeQueue("scenario_generation", toRows(scenarios)),
      summarizeQueue("dds_reference_generation", toRows(references)),
      summarizeQueue(
        "dds_text_evaluation",
        splitLeased(toRows(evaluations), Number(leased[0]?.total ?? 0)),
      ),
      summarizeQueue("dds_insights", toRows(insights)),
    ];
    return {
      queues: queues.map((queue) => ({
        ...queue,
        enabled: this.scheduler.isEnabled(queue.name),
      })),
    };
  }
}
