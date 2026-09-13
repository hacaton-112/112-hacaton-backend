import { z } from "zod";

import {
  EMERGENCY_SERVICES,
  FACT_SEVERITIES,
  INCIDENT_CARD_FIELDS,
  SCENARIO_CATEGORIES,
  TERRAIN_TYPES,
} from "@/drizzle/schema";
import {
  ScenarioSeedSchema,
  type ScenarioSeed,
} from "@/modules/scenario-engine/domain/scenario-seed.schema";

const AssistantCardFieldSchema = z.enum([...INCIDENT_CARD_FIELDS, "none"]);

/**
 * A deliberately smaller model-facing shape than ScenarioSeed.
 *
 * The assistant describes the incident. Technical defaults and the complete
 * Scenario Engine shape are assembled deterministically on the server and
 * validated through ScenarioSeedSchema afterwards.
 */
export const ScenarioAssistantSuggestionSchema = z
  .object({
    title: z.string().min(3).max(120),
    category: z.enum(SCENARIO_CATEGORIES),
    difficulty: z.number().int().min(1).max(5),
    summary: z.string().min(10).max(400),
    persona: z
      .object({
        gender: z.enum(["male", "female"]),
        displayName: z.string().min(2).max(120),
        ageYears: z.number().int().min(1).max(110),
        condition: z.string().min(2).max(200),
        speechStyle: z.string().min(10).max(2_000),
        backgroundSounds: z.string().max(200),
        baselinePanicLevel: z.number().int().min(0).max(4),
        baseSpeechRate: z.number().min(0.5).max(2),
      })
      .strict(),
    openingLine: z.string().min(3).max(500),
    fallbackLine: z.string().min(3).max(500),
    expectedServices: z.array(z.enum(EMERGENCY_SERVICES)).min(1).max(4),
    location: z
      .object({
        terrain: z.enum(TERRAIN_TYPES),
        city: z.string().max(120),
        street: z.string().max(120),
        house: z.string().max(32),
        details: z.string().max(200),
        exactPoint: z
          .object({
            lat: z.number().min(-90).max(90),
            lon: z.number().min(-180).max(180),
          })
          .strict(),
        locatorLabel: z.string().min(3).max(200),
        callerNumber: z.string().min(3).max(32),
      })
      .strict(),
    facts: z
      .array(
        z
          .object({
            key: z
              .string()
              .min(1)
              .max(128)
              .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
            promptValue: z.string().min(2).max(1_000),
            displayLabel: z.string().min(2).max(120),
            severity: z.enum(FACT_SEVERITIES),
            cardField: AssistantCardFieldSchema,
            cardValue: z.string().max(200),
            contentKeywords: z.array(z.string().min(2)).min(1).max(12),
            disclosureType: z.enum(["immediate", "on_question", "never"]),
            questionKeywords: z.array(z.string().min(2)).min(1).max(12),
            priority: z.number().int().min(0).max(100),
          })
          .strict(),
      )
      .min(3)
      .max(12),
    mandatoryQuestions: z
      .array(
        z
          .object({
            text: z.string().min(5).max(300),
            satisfiedByFactKeys: z.array(z.string().min(1).max(128)).min(1),
            isCritical: z.boolean(),
          })
          .strict(),
      )
      .min(2)
      .max(10),
    referenceNotes: z.string().max(2_000),
  })
  .strict();

export type ScenarioAssistantSuggestion = z.infer<
  typeof ScenarioAssistantSuggestionSchema
>;

const shiftCoordinate = (value: number, maximum: number): number =>
  Number(
    (value > maximum - 0.002 ? value - 0.0015 : value + 0.0015).toFixed(6),
  );

/** Converts descriptive AI output into the authoritative Scenario Engine seed. */
export const buildScenarioSeedFromSuggestion = (
  code: string,
  rawSuggestion: unknown,
): ScenarioSeed => {
  const suggestion = ScenarioAssistantSuggestionSchema.parse(rawSuggestion);
  const exactAddress = Object.fromEntries(
    Object.entries({
      city: suggestion.location.city,
      street: suggestion.location.street,
      house: suggestion.location.house,
      details: suggestion.location.details,
    }).filter(([, value]) => value.trim().length > 0),
  );

  const seenReferenceFields = new Set<string>();
  const referenceFields = suggestion.facts.flatMap((fact) => {
    if (
      fact.cardField === "none" ||
      fact.cardValue.trim().length === 0 ||
      seenReferenceFields.has(fact.cardField)
    ) {
      return [];
    }

    seenReferenceFields.add(fact.cardField);

    return [
      {
        field: fact.cardField,
        expectedValue: fact.cardValue,
        acceptableValues: [],
        comparison: "normalized" as const,
        isRequired: true,
        sourceFactKey: fact.key,
      },
    ];
  });

  return ScenarioSeedSchema.parse({
    code,
    title: suggestion.title,
    category: suggestion.category,
    difficulty: suggestion.difficulty,
    summary: suggestion.summary,
    persona: {
      code: `${code.toLowerCase()}-caller`,
      gender: suggestion.persona.gender,
      displayName: suggestion.persona.displayName,
      ageYears: suggestion.persona.ageYears,
      condition: suggestion.persona.condition,
      speechStyle: suggestion.persona.speechStyle,
      ...(suggestion.persona.backgroundSounds.trim().length === 0
        ? {}
        : { backgroundSounds: suggestion.persona.backgroundSounds }),
      voiceId: suggestion.persona.gender === "male" ? "aiden" : "serena",
      baselinePanicLevel: suggestion.persona.baselinePanicLevel,
      baseSpeechRate: suggestion.persona.baseSpeechRate,
    },
    version: {
      panicFloor: 0,
      panicCeiling: 4,
      maxInterruptions: 3,
      initiativeCooldownSeconds: 12,
      answerNormSeconds: 240,
      expectedDurationSeconds: 240 + suggestion.difficulty * 60,
      passThreshold: 75,
      expectedServices: suggestion.expectedServices,
      referenceNotes: suggestion.referenceNotes,
      openingLine: suggestion.openingLine,
      fallbackLine: suggestion.fallbackLine,
    },
    location: {
      terrain: suggestion.location.terrain,
      exactAddress,
      exactPoint: [
        suggestion.location.exactPoint.lat,
        suggestion.location.exactPoint.lon,
      ],
      locatorCenter: [
        shiftCoordinate(suggestion.location.exactPoint.lat, 90),
        shiftCoordinate(suggestion.location.exactPoint.lon, 180),
      ],
      locatorRadiusMeters: 500,
      locatorLabel: suggestion.location.locatorLabel,
      locatorAccuracy: "approximate",
      callerNumber: suggestion.location.callerNumber,
      previouslyCalled: false,
    },
    escalation: [
      {
        trigger: "operator_silence",
        direction: "up",
        cooldownSeconds: 20,
        params: { seconds: 20 },
      },
      {
        trigger: "calming_phrase",
        direction: "down",
        cooldownSeconds: 4,
        params: {
          keywords: ["спокойно", "я вас слышу", "помощь выехала"],
        },
      },
    ],
    facts: suggestion.facts.map((fact) => ({
      key: fact.key,
      promptValue: fact.promptValue,
      displayLabel: fact.displayLabel,
      severity: fact.severity,
      cardField: fact.cardField === "none" ? null : fact.cardField,
      cardValue: fact.cardValue.trim().length === 0 ? null : fact.cardValue,
      contentKeywords: fact.contentKeywords,
      disclosure:
        fact.disclosureType === "on_question"
          ? { type: "on_question" as const, keywords: fact.questionKeywords }
          : { type: fact.disclosureType },
      priority: fact.priority,
    })),
    mandatoryQuestions: suggestion.mandatoryQuestions,
    referenceCard: {
      fields: referenceFields,
      notes: suggestion.referenceNotes,
    },
  });
};

/** JSON Schema sent to the provider; Zod remains authoritative after output. */
export const scenarioAssistantJsonSchema = (): Record<string, unknown> => {
  const { $schema: _, ...schema } = z.toJSONSchema(
    ScenarioAssistantSuggestionSchema,
  );

  return schema;
};
