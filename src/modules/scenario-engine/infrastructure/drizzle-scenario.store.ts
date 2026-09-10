import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { generateId } from "@/common/utils/id";
import type { DialogueTurn } from "@/contracts";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  callerPersonas,
  callEvents,
  callStates,
  escalationRules,
  mandatoryQuestions,
  scenarioFacts,
  scenarioLocations,
  scenarios,
  scenarioVersions,
} from "@/drizzle/schema";

import { DisclosureRuleSchema, type ScenarioFact } from "../domain/disclosure";
import { EscalationParamsSchema } from "../domain/escalation-params";
import { clampPanicLevel, type PanicLevel } from "../domain/panic-scale";
import type {
  AppendOutcome,
  CallStatePatch,
  CallStateSnapshot,
  NewCallEvent,
  ScenarioStore,
  ScenarioVersionSnapshot,
} from "../ports/scenario-store.port";

const toPanicLevel = (value: number): PanicLevel =>
  clampPanicLevel(value, 0, 4);

@Injectable()
export class DrizzleScenarioStore implements ScenarioStore {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleService["db"]) {}

  async loadVersion(
    scenarioVersionId: string,
  ): Promise<ScenarioVersionSnapshot | null> {
    const [row] = await this.db
      .select({
        version: scenarioVersions,
        scenario: scenarios,
        persona: callerPersonas,
      })
      .from(scenarioVersions)
      .innerJoin(scenarios, eq(scenarioVersions.scenarioId, scenarios.id))
      .innerJoin(
        callerPersonas,
        eq(scenarioVersions.personaId, callerPersonas.id),
      )
      .where(eq(scenarioVersions.id, scenarioVersionId))
      .limit(1);

    if (!row) {
      return null;
    }

    const [facts, rules, questions, location] = await Promise.all([
      this.db
        .select()
        .from(scenarioFacts)
        .where(eq(scenarioFacts.scenarioVersionId, scenarioVersionId))
        .orderBy(asc(scenarioFacts.orderIndex)),
      this.db
        .select()
        .from(escalationRules)
        .where(eq(escalationRules.scenarioVersionId, scenarioVersionId)),
      this.db
        .select()
        .from(mandatoryQuestions)
        .where(eq(mandatoryQuestions.scenarioVersionId, scenarioVersionId))
        .orderBy(asc(mandatoryQuestions.orderIndex)),
      this.db
        .select()
        .from(scenarioLocations)
        .where(eq(scenarioLocations.scenarioVersionId, scenarioVersionId))
        .limit(1),
    ]);

    return {
      id: row.version.id,
      scenarioCode: row.scenario.code,
      title: row.scenario.title,
      category: row.scenario.category,
      difficulty: row.scenario.difficulty,
      // Черновик и архив запускать нельзя, и решает это состояние сценария, а
      // не наличие даты публикации у версии.
      isPublished:
        row.scenario.status === "published" && row.version.publishedAt !== null,
      panicFloor: toPanicLevel(row.version.panicFloor),
      panicCeiling: toPanicLevel(row.version.panicCeiling),
      maxInterruptions: row.version.maxInterruptions,
      initiativeCooldownSeconds: row.version.initiativeCooldownSeconds,
      answerNormSeconds: row.version.answerNormSeconds,
      passThreshold: row.version.passThreshold,
      expectedServices: row.version.expectedServices,
      openingLine: row.version.openingLine,
      fallbackLine: row.version.fallbackLine,
      persona: {
        displayName: row.persona.displayName,
        gender: row.persona.gender,
        ageYears: row.persona.ageYears,
        condition: row.persona.condition,
        speechStyle: row.persona.speechStyle,
        backgroundSounds: row.persona.backgroundSounds,
        voiceId: row.persona.voiceId,
        baselinePanicLevel: toPanicLevel(row.persona.baselinePanicLevel),
        baseSpeechRate: Number(row.persona.baseSpeechRate),
      },
      facts: facts.map((fact): ScenarioFact => ({
        key: fact.key,
        promptValue: fact.promptValue,
        severity: fact.severity,
        // Условие лежит в jsonb, поэтому проверяется схемой на входе: битое
        // правило должно валить загрузку сценария, а не молча открывать факт.
        disclosure: DisclosureRuleSchema.parse(fact.disclosure),
        contentKeywords: fact.contentKeywords,
        priority: fact.priority,
        orderIndex: fact.orderIndex,
      })),
      escalationRules: rules.map((rule) => ({
        trigger: rule.trigger,
        direction: rule.direction,
        cooldownSeconds: rule.cooldownSeconds,
        ...EscalationParamsSchema.parse(rule.params ?? {}),
      })),
      mandatoryQuestions: questions.map((question) => ({
        orderIndex: question.orderIndex,
        text: question.text,
        satisfiedByFactKeys: question.satisfiedByFactKeys,
        isCritical: question.isCritical,
      })),
      locator: location[0]
        ? {
            centerLat: Number(location[0].locatorCenterLat),
            centerLon: Number(location[0].locatorCenterLon),
            radiusMeters: location[0].locatorRadiusMeters,
            label: location[0].locatorLabel,
            accuracy: location[0].locatorAccuracy,
            callerNumber: location[0].callerNumber,
            previouslyCalled: location[0].previouslyCalled,
          }
        : null,
    };
  }

  async loadCall(trainingSessionId: string): Promise<CallStateSnapshot | null> {
    const [row] = await this.db
      .select()
      .from(callStates)
      .where(eq(callStates.trainingSessionId, trainingSessionId))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      trainingSessionId: row.trainingSessionId,
      scenarioVersionId: row.scenarioVersionId,
      operatorId: row.operatorId,
      stage: row.stage,
      panicLevel: toPanicLevel(row.panicLevel),
      panicChangedAt: row.panicChangedAt,
      rngSeed: row.rngSeed,
      interruptionsUsed: row.interruptionsUsed,
      lastInitiativeAt: row.lastInitiativeAt,
      operatorSilenceSince: row.operatorSilenceSince,
      revealedFactKeys: row.revealedFactKeys,
      callerTurns: row.callerTurns,
      offeredAt: row.offeredAt,
      answeredAt: row.answeredAt,
      endedAt: row.endedAt,
      lastSequence: row.lastSequence,
    };
  }

  async startCall(
    state: CallStateSnapshot,
    commandEventId: string,
    event: NewCallEvent,
  ): Promise<AppendOutcome> {
    return this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(callStates)
        .values({
          trainingSessionId: state.trainingSessionId,
          scenarioVersionId: state.scenarioVersionId,
          operatorId: state.operatorId,
          stage: state.stage,
          panicLevel: state.panicLevel,
          rngSeed: state.rngSeed,
          revealedFactKeys: [...state.revealedFactKeys],
          offeredAt: state.offeredAt,
          lastSequence: 1,
        })
        // Повторный старт того же звонка — это переподключение, а не новая
        // тренировка: строка уже есть, и второй журнал заводить нельзя.
        .onConflictDoNothing({ target: callStates.trainingSessionId })
        .returning({ id: callStates.trainingSessionId });

      if (inserted.length === 0) {
        return "duplicate";
      }

      await tx.insert(callEvents).values({
        id: generateId(),
        trainingSessionId: state.trainingSessionId,
        sequence: 1,
        type: event.type,
        actor: event.actor,
        eventId: commandEventId,
        payload: event.payload ?? null,
        occurredAt: event.occurredAt,
      });

      return "applied";
    });
  }

  async loadRecentTurns(
    trainingSessionId: string,
    limit: number,
  ): Promise<readonly DialogueTurn[]> {
    // Берём хвост журнала и разворачиваем: модели нужен порядок разговора, а
    // выбирать последние строки удобнее по убыванию.
    const rows = await this.db
      .select({
        type: callEvents.type,
        payload: callEvents.payload,
      })
      .from(callEvents)
      .where(
        and(
          eq(callEvents.trainingSessionId, trainingSessionId),
          inArray(callEvents.type, ["operator.utterance", "caller.reply"]),
        ),
      )
      .orderBy(desc(callEvents.sequence))
      .limit(limit);

    return rows
      .reverse()
      .map((row) => ({
        role:
          row.type === "operator.utterance"
            ? ("operator" as const)
            : ("caller" as const),
        text: String(row.payload?.text ?? ""),
      }))
      .filter((turn) => turn.text.length > 0);
  }

  async appendTurn(
    trainingSessionId: string,
    commandEventId: string,
    events: readonly NewCallEvent[],
    patch: CallStatePatch,
  ): Promise<AppendOutcome> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ lastSequence: callStates.lastSequence })
        .from(callStates)
        .where(eq(callStates.trainingSessionId, trainingSessionId))
        .limit(1);

      if (!current) {
        return "duplicate";
      }

      const [existing] = await tx
        .select({ id: callEvents.id })
        .from(callEvents)
        .where(
          and(
            eq(callEvents.trainingSessionId, trainingSessionId),
            eq(callEvents.eventId, commandEventId),
          ),
        )
        .limit(1);

      if (existing) {
        return "duplicate";
      }

      const rows = events.map((event, index) => ({
        id: generateId(),
        trainingSessionId,
        sequence: current.lastSequence + index + 1,
        type: event.type,
        actor: event.actor,
        // Идентификатор команды несёт только первое событие хода; производные
        // получают собственный, иначе они столкнулись бы на уникальном индексе.
        eventId: index === 0 ? commandEventId : generateId(),
        payload: event.payload ?? null,
        occurredAt: event.occurredAt,
      }));

      if (rows.length > 0) {
        await tx.insert(callEvents).values(rows);
      }

      await tx
        .update(callStates)
        .set({
          ...patch,
          revealedFactKeys: patch.revealedFactKeys
            ? [...patch.revealedFactKeys]
            : undefined,
          lastSequence: current.lastSequence + rows.length,
        })
        .where(eq(callStates.trainingSessionId, trainingSessionId));

      return "applied";
    });
  }
}
