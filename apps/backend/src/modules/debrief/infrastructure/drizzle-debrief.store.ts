import { Inject, Injectable } from "@nestjs/common";
import { and, asc, avg, count, desc, eq, ne } from "drizzle-orm";

import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  callEvaluations,
  callEvents,
  callStates,
  mandatoryQuestions,
  referenceCardFields,
  scenarioFacts,
  scenarios,
  scenarioVersions,
} from "@/drizzle/schema";

import type { CallSummary } from "../dto/debrief.dto";
import type {
  DebriefCall,
  DebriefStore,
  GroupResult,
  JournalEntry,
  MandatoryQuestionRow,
  ReferenceFieldRow,
  ScenarioFactRow,
} from "../ports/debrief.store.port";

const MILLISECONDS_PER_SECOND = 1_000;

const seconds = (from: Date | null, to: Date | null): number | null =>
  from === null || to === null
    ? null
    : Math.max(
        0,
        Math.round((to.getTime() - from.getTime()) / MILLISECONDS_PER_SECOND),
      );

@Injectable()
export class DrizzleDebriefStore implements DebriefStore {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService["db"]) {}

  async listCalls(
    operatorId: string,
    limit: number,
  ): Promise<readonly CallSummary[]> {
    const rows = await this.db
      .select({
        trainingSessionId: callStates.trainingSessionId,
        scenarioCode: scenarios.code,
        title: scenarios.title,
        stage: callStates.stage,
        offeredAt: callStates.offeredAt,
        answeredAt: callStates.answeredAt,
        endedAt: callStates.endedAt,
      })
      .from(callStates)
      .innerJoin(
        scenarioVersions,
        eq(callStates.scenarioVersionId, scenarioVersions.id),
      )
      .innerJoin(scenarios, eq(scenarioVersions.scenarioId, scenarios.id))
      .where(eq(callStates.operatorId, operatorId))
      .orderBy(desc(callStates.offeredAt))
      .limit(limit);

    return rows.map((row) => this.toSummary(row));
  }

  async loadCall(trainingSessionId: string): Promise<DebriefCall | null> {
    const [row] = await this.db
      .select({
        trainingSessionId: callStates.trainingSessionId,
        operatorId: callStates.operatorId,
        scenarioVersionId: callStates.scenarioVersionId,
        scenarioCode: scenarios.code,
        title: scenarios.title,
        stage: callStates.stage,
        offeredAt: callStates.offeredAt,
        answeredAt: callStates.answeredAt,
        endedAt: callStates.endedAt,
        panicLevel: callStates.panicLevel,
        revealedFactKeys: callStates.revealedFactKeys,
        answerNormSeconds: scenarioVersions.answerNormSeconds,
        expectedDurationSeconds: scenarioVersions.expectedDurationSeconds,
        passThreshold: scenarioVersions.passThreshold,
        expectedServices: scenarioVersions.expectedServices,
        difficulty: scenarios.difficulty,
      })
      .from(callStates)
      .innerJoin(
        scenarioVersions,
        eq(callStates.scenarioVersionId, scenarioVersions.id),
      )
      .innerJoin(scenarios, eq(scenarioVersions.scenarioId, scenarios.id))
      .where(eq(callStates.trainingSessionId, trainingSessionId))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      ...this.toSummary(row),
      operatorId: row.operatorId,
      scenarioVersionId: row.scenarioVersionId,
      answerNormSeconds: row.answerNormSeconds,
      expectedDurationSeconds: row.expectedDurationSeconds,
      passThreshold: row.passThreshold,
      difficulty: row.difficulty,
      expectedServices: row.expectedServices,
      panicLevel: row.panicLevel,
      revealedFactKeys: row.revealedFactKeys,
    };
  }

  async loadReferenceCard(
    scenarioVersionId: string,
  ): Promise<readonly ReferenceFieldRow[]> {
    return this.db
      .select({
        field: referenceCardFields.field,
        expectedValue: referenceCardFields.expectedValue,
        acceptableValues: referenceCardFields.acceptableValues,
        comparison: referenceCardFields.comparison,
        isRequired: referenceCardFields.isRequired,
      })
      .from(referenceCardFields)
      .where(eq(referenceCardFields.scenarioVersionId, scenarioVersionId));
  }

  async loadScore(trainingSessionId: string): Promise<number | null> {
    const [row] = await this.db
      .select({ score: callEvaluations.score })
      .from(callEvaluations)
      .where(eq(callEvaluations.trainingSessionId, trainingSessionId))
      .limit(1);

    return row?.score ?? null;
  }

  async saveScore(
    trainingSessionId: string,
    scenarioVersionId: string,
    score: number,
  ): Promise<void> {
    // Пересчёт того же звонка даёт то же число, поэтому конфликт — не ошибка.
    await this.db
      .insert(callEvaluations)
      .values({ trainingSessionId, scenarioVersionId, score })
      .onConflictDoUpdate({
        target: callEvaluations.trainingSessionId,
        set: { score, computedAt: new Date() },
      });
  }

  async loadGroupResult(
    scenarioVersionId: string,
    exceptTrainingSessionId: string,
  ): Promise<GroupResult> {
    const [row] = await this.db
      .select({
        averageScore: avg(callEvaluations.score),
        calls: count(callEvaluations.trainingSessionId),
      })
      .from(callEvaluations)
      .where(
        and(
          eq(callEvaluations.scenarioVersionId, scenarioVersionId),
          ne(callEvaluations.trainingSessionId, exceptTrainingSessionId),
        ),
      );

    return {
      averageScore: Math.round(Number(row?.averageScore ?? 0)),
      calls: Number(row?.calls ?? 0),
    };
  }

  async loadJournal(
    trainingSessionId: string,
  ): Promise<readonly JournalEntry[]> {
    return this.db
      .select({
        sequence: callEvents.sequence,
        type: callEvents.type,
        actor: callEvents.actor,
        occurredAt: callEvents.occurredAt,
        payload: callEvents.payload,
      })
      .from(callEvents)
      .where(eq(callEvents.trainingSessionId, trainingSessionId))
      .orderBy(asc(callEvents.sequence));
  }

  async loadFacts(
    scenarioVersionId: string,
  ): Promise<readonly ScenarioFactRow[]> {
    return this.db
      .select({
        key: scenarioFacts.key,
        label: scenarioFacts.displayLabel,
        severity: scenarioFacts.severity,
      })
      .from(scenarioFacts)
      .where(eq(scenarioFacts.scenarioVersionId, scenarioVersionId))
      .orderBy(asc(scenarioFacts.orderIndex));
  }

  async loadQuestions(
    scenarioVersionId: string,
  ): Promise<readonly MandatoryQuestionRow[]> {
    return this.db
      .select({
        text: mandatoryQuestions.text,
        isCritical: mandatoryQuestions.isCritical,
        satisfiedByFactKeys: mandatoryQuestions.satisfiedByFactKeys,
      })
      .from(mandatoryQuestions)
      .where(eq(mandatoryQuestions.scenarioVersionId, scenarioVersionId))
      .orderBy(asc(mandatoryQuestions.orderIndex));
  }

  private toSummary(row: {
    trainingSessionId: string;
    scenarioCode: string;
    title: string;
    stage: CallSummary["stage"];
    offeredAt: Date;
    answeredAt: Date | null;
    endedAt: Date | null;
  }): CallSummary {
    return {
      trainingSessionId: row.trainingSessionId,
      scenarioCode: row.scenarioCode,
      title: row.title,
      stage: row.stage,
      offeredAt: row.offeredAt.toISOString(),
      answeredAt: row.answeredAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
      // Разговор считается от приёма вызова: ожидание в него не входит.
      durationSeconds: seconds(row.answeredAt, row.endedAt),
    };
  }
}
