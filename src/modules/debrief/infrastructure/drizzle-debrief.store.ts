import { Inject, Injectable } from "@nestjs/common";
import { asc, desc, eq } from "drizzle-orm";

import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  callEvents,
  callStates,
  mandatoryQuestions,
  scenarioFacts,
  scenarios,
  scenarioVersions,
} from "@/drizzle/schema";

import type { CallSummary } from "../dto/debrief.dto";
import type {
  DebriefCall,
  DebriefStore,
  JournalEntry,
  MandatoryQuestionRow,
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
      panicLevel: row.panicLevel,
      revealedFactKeys: row.revealedFactKeys,
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
