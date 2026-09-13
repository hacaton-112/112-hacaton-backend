import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { generateId } from "@/common/utils/id";
import type { DrizzleService } from "@/core/database/drizzle.service";
import { DRIZZLE } from "@/core/database/drizzle.token";
import {
  callerPersonas,
  escalationRules,
  mandatoryQuestions,
  referenceCardFields,
  scenarioFacts,
  scenarioLocations,
  scenarios,
  scenarioVersions,
} from "@/drizzle/schema";
import { AuditLogService } from "@/modules/audit-log/audit-log.service";

import {
  ScenarioAuthoringConflictError,
  type PublishScenarioInput,
  type PublishedScenario,
  type ScenarioAuthoringRepository,
} from "../ports/scenario-authoring.repository";

@Injectable()
export class DrizzleScenarioAuthoringRepository implements ScenarioAuthoringRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleService["db"],
    private readonly auditLog: AuditLogService,
  ) {}

  publish(input: PublishScenarioInput): Promise<PublishedScenario> {
    return this.db.transaction(async (tx) => {
      const [existingScenario] = await tx
        .select({ id: scenarios.id })
        .from(scenarios)
        .where(eq(scenarios.code, input.scenario.code))
        .limit(1);

      if (existingScenario) {
        throw new ScenarioAuthoringConflictError("scenario-code");
      }

      const [existingPersona] = await tx
        .select({ id: callerPersonas.id })
        .from(callerPersonas)
        .where(eq(callerPersonas.code, input.scenario.persona.code))
        .limit(1);

      if (existingPersona) {
        throw new ScenarioAuthoringConflictError("persona-code");
      }

      const now = new Date();
      const scenarioId = generateId();
      const scenarioVersionId = generateId();
      const personaId = generateId();

      await tx.insert(callerPersonas).values({
        id: personaId,
        code: input.scenario.persona.code,
        displayName: input.scenario.persona.displayName,
        gender: input.scenario.persona.gender,
        ageYears: input.scenario.persona.ageYears,
        condition: input.scenario.persona.condition,
        speechStyle: input.scenario.persona.speechStyle,
        backgroundSounds: input.scenario.persona.backgroundSounds ?? null,
        voiceId: input.scenario.persona.voiceId,
        baselinePanicLevel: input.scenario.persona.baselinePanicLevel,
        baseSpeechRate: input.scenario.persona.baseSpeechRate.toFixed(2),
      });

      await tx.insert(scenarios).values({
        id: scenarioId,
        code: input.scenario.code,
        title: input.scenario.title,
        category: input.scenario.category,
        difficulty: input.scenario.difficulty,
        summary: input.scenario.summary,
        status: "published",
        authorId: input.authorId,
        updatedAt: now,
      });

      await tx.insert(scenarioVersions).values({
        id: scenarioVersionId,
        scenarioId,
        version: 1,
        personaId,
        panicFloor: input.scenario.version.panicFloor,
        panicCeiling: input.scenario.version.panicCeiling,
        maxInterruptions: input.scenario.version.maxInterruptions,
        initiativeCooldownSeconds:
          input.scenario.version.initiativeCooldownSeconds,
        answerNormSeconds: input.scenario.version.answerNormSeconds,
        expectedDurationSeconds: input.scenario.version.expectedDurationSeconds,
        passThreshold: input.scenario.version.passThreshold,
        expectedServices: input.scenario.version.expectedServices,
        referenceNotes:
          input.scenario.version.referenceNotes ??
          input.scenario.referenceCard.notes ??
          null,
        openingLine: input.scenario.version.openingLine,
        fallbackLine: input.scenario.version.fallbackLine,
        authoringSource: input.authoringSource,
        authoringPrompt: input.authoringPrompt ?? null,
        reviewedBy: input.authorId,
        reviewedAt: now,
        publishedBy: input.authorId,
        publishedAt: now,
      });

      await tx.insert(scenarioLocations).values({
        scenarioVersionId,
        terrain: input.scenario.location.terrain,
        exactAddress: input.scenario.location.exactAddress,
        exactLat: input.scenario.location.exactPoint[0].toFixed(6),
        exactLon: input.scenario.location.exactPoint[1].toFixed(6),
        locatorCenterLat: input.scenario.location.locatorCenter[0].toFixed(6),
        locatorCenterLon: input.scenario.location.locatorCenter[1].toFixed(6),
        locatorRadiusMeters: input.scenario.location.locatorRadiusMeters,
        locatorLabel: input.scenario.location.locatorLabel,
        locatorAccuracy: input.scenario.location.locatorAccuracy,
        callerNumber: input.scenario.location.callerNumber,
        previouslyCalled: input.scenario.location.previouslyCalled,
      });

      await tx.insert(scenarioFacts).values(
        input.scenario.facts.map((fact, orderIndex) => ({
          id: generateId(),
          scenarioVersionId,
          key: fact.key,
          promptValue: fact.promptValue,
          displayLabel: fact.displayLabel,
          severity: fact.severity,
          cardField: fact.cardField,
          cardValue: fact.cardValue,
          contentKeywords: fact.contentKeywords,
          disclosure: fact.disclosure,
          priority: fact.priority,
          orderIndex,
        })),
      );

      if (input.scenario.escalation.length > 0) {
        await tx.insert(escalationRules).values(
          input.scenario.escalation.map((rule) => ({
            id: generateId(),
            scenarioVersionId,
            trigger: rule.trigger,
            direction: rule.direction,
            params: rule.params ?? null,
            cooldownSeconds: rule.cooldownSeconds,
          })),
        );
      }

      if (input.scenario.mandatoryQuestions.length > 0) {
        await tx.insert(mandatoryQuestions).values(
          input.scenario.mandatoryQuestions.map((question, orderIndex) => ({
            id: generateId(),
            scenarioVersionId,
            orderIndex,
            text: question.text,
            satisfiedByFactKeys: question.satisfiedByFactKeys,
            isCritical: question.isCritical,
          })),
        );
      }

      if (input.scenario.referenceCard.fields.length > 0) {
        await tx.insert(referenceCardFields).values(
          input.scenario.referenceCard.fields.map((field) => ({
            id: generateId(),
            scenarioVersionId,
            field: field.field,
            expectedValue: field.expectedValue,
            acceptableValues: field.acceptableValues,
            comparison: field.comparison,
            isRequired: field.isRequired,
            sourceFactKey: field.sourceFactKey,
          })),
        );
      }

      await this.auditLog.log(
        {
          actorId: input.authorId,
          action: "scenario.publish",
          resource: "scenario-version",
          resourceId: scenarioVersionId,
          details: {
            scenarioId,
            code: input.scenario.code,
            version: 1,
            authoringSource: input.authoringSource,
          },
        },
        tx,
      );

      return {
        scenarioId,
        scenarioVersionId,
        code: input.scenario.code,
        title: input.scenario.title,
        version: 1,
        status: "published",
        publishedAt: now.toISOString(),
      };
    });
  }
}
