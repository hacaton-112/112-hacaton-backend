import { Inject, Injectable } from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  scenarioGenerationJobs,
  type ScenarioGenerationJobRecord,
} from "@/drizzle/schema";

import type {
  ClaimedScenarioGenerationJob,
  ScenarioGenerationRepository,
} from "../ports/scenario-generation.repository";

@Injectable()
export class DrizzleScenarioGenerationRepository implements ScenarioGenerationRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService["db"]) {}

  async enqueue(input: {
    id: string;
    createdBy: string;
    brief: string;
    now: Date;
  }): Promise<ScenarioGenerationJobRecord> {
    const [job] = await this.db
      .insert(scenarioGenerationJobs)
      .values({
        id: input.id,
        createdBy: input.createdBy,
        brief: input.brief,
        createdAt: input.now,
      })
      .returning();
    return job;
  }

  async countActive(createdBy: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(scenarioGenerationJobs)
      .where(
        and(
          eq(scenarioGenerationJobs.createdBy, createdBy),
          inArray(scenarioGenerationJobs.status, ["queued", "running"]),
        ),
      );
    return Number(row?.total ?? 0);
  }

  listByOwner(
    createdBy: string,
    limit: number,
  ): Promise<ScenarioGenerationJobRecord[]> {
    return this.db
      .select()
      .from(scenarioGenerationJobs)
      .where(
        and(
          eq(scenarioGenerationJobs.createdBy, createdBy),
          isNull(scenarioGenerationJobs.dismissedAt),
        ),
      )
      .orderBy(desc(scenarioGenerationJobs.createdAt))
      .limit(limit);
  }

  async get(id: string): Promise<ScenarioGenerationJobRecord | null> {
    const [job] = await this.db
      .select()
      .from(scenarioGenerationJobs)
      .where(eq(scenarioGenerationJobs.id, id))
      .limit(1);
    return job ?? null;
  }

  async queuePositions(
    jobs: readonly ScenarioGenerationJobRecord[],
  ): Promise<ReadonlyMap<string, number>> {
    const queued = jobs.filter((job) => job.status === "queued");
    if (queued.length === 0) return new Map();
    // Очередь общая для всех преподавателей: позиция считается по всем
    // заданиям, а не только по своим.
    const rows = await this.db
      .select({ id: scenarioGenerationJobs.id })
      .from(scenarioGenerationJobs)
      .where(eq(scenarioGenerationJobs.status, "queued"))
      .orderBy(
        asc(scenarioGenerationJobs.createdAt),
        asc(scenarioGenerationJobs.id),
      );
    const order = new Map(rows.map((row, index) => [row.id, index + 1]));
    return new Map(
      queued.flatMap((job) => {
        const position = order.get(job.id);
        return position === undefined ? [] : [[job.id, position] as const];
      }),
    );
  }

  async claimNext(input: {
    leaseToken: string;
    leaseUntil: Date;
    maxAttempts: number;
    now: Date;
  }): Promise<ClaimedScenarioGenerationJob | null> {
    return this.db.transaction(async (tx) => {
      const [candidate] = await tx
        .select({ id: scenarioGenerationJobs.id })
        .from(scenarioGenerationJobs)
        .where(
          and(
            lt(scenarioGenerationJobs.attempts, input.maxAttempts),
            or(
              eq(scenarioGenerationJobs.status, "queued"),
              and(
                eq(scenarioGenerationJobs.status, "running"),
                lt(scenarioGenerationJobs.leaseUntil, input.now),
              ),
            ),
          ),
        )
        .orderBy(asc(scenarioGenerationJobs.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!candidate) return null;

      const [job] = await tx
        .update(scenarioGenerationJobs)
        .set({
          status: "running",
          attempts: sql`${scenarioGenerationJobs.attempts} + 1`,
          leaseToken: input.leaseToken,
          leaseUntil: input.leaseUntil,
          startedAt: input.now,
        })
        .where(eq(scenarioGenerationJobs.id, candidate.id))
        .returning();
      return job ? { job, leaseToken: input.leaseToken } : null;
    });
  }

  async complete(
    claimed: ClaimedScenarioGenerationJob,
    result: unknown,
    now: Date,
  ): Promise<void> {
    await this.db
      .update(scenarioGenerationJobs)
      .set({
        status: "done",
        result,
        errorCode: null,
        errorMessage: null,
        leaseToken: null,
        leaseUntil: null,
        finishedAt: now,
      })
      .where(this.ownedBy(claimed));
  }

  async fail(
    claimed: ClaimedScenarioGenerationJob,
    error: { code: string; message: string },
    now: Date,
  ): Promise<void> {
    await this.db
      .update(scenarioGenerationJobs)
      .set({
        status: claimed.job.attempts >= 3 ? "failed" : "queued",
        errorCode: error.code,
        errorMessage:
          claimed.job.attempts >= 3
            ? error.message.slice(0, 1_000)
            : "Повторная попытка после временной ошибки",
        leaseToken: null,
        leaseUntil: null,
        finishedAt: claimed.job.attempts >= 3 ? now : null,
      })
      .where(this.ownedBy(claimed));
  }

  async failExhausted(maxAttempts: number, now: Date): Promise<number> {
    const failed = await this.db
      .update(scenarioGenerationJobs)
      .set({
        status: "failed",
        errorCode: "SCENARIO_ASSISTANT_UNAVAILABLE",
        errorMessage:
          "Генерация прерывалась несколько раз подряд и остановлена",
        leaseToken: null,
        leaseUntil: null,
        finishedAt: now,
      })
      .where(
        and(
          eq(scenarioGenerationJobs.status, "running"),
          lt(scenarioGenerationJobs.leaseUntil, now),
          sql`${scenarioGenerationJobs.attempts} >= ${maxAttempts}`,
        ),
      )
      .returning({ id: scenarioGenerationJobs.id });
    return failed.length;
  }

  async dismiss(id: string, createdBy: string, now: Date): Promise<boolean> {
    const dismissed = await this.db
      .update(scenarioGenerationJobs)
      .set({ dismissedAt: now })
      .where(
        and(
          eq(scenarioGenerationJobs.id, id),
          eq(scenarioGenerationJobs.createdBy, createdBy),
          inArray(scenarioGenerationJobs.status, ["done", "failed"]),
        ),
      )
      .returning({ id: scenarioGenerationJobs.id });
    return dismissed.length > 0;
  }

  /**
   * Результат пишет только тот, кто держит аренду: если она истекла и
   * задание уже взял другой обработчик, запоздалый ответ ничего не портит.
   */
  private ownedBy(claimed: ClaimedScenarioGenerationJob) {
    return and(
      eq(scenarioGenerationJobs.id, claimed.job.id),
      eq(scenarioGenerationJobs.leaseToken, claimed.leaseToken),
    );
  }
}
