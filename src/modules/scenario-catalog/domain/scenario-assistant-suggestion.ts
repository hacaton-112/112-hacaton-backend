import { z } from "zod";

import {
  EMERGENCY_SERVICES,
  FACT_SEVERITIES,
  INCIDENT_CARD_FIELDS,
  SCENARIO_CATEGORIES,
} from "@/drizzle/schema";
import { CallerUtteranceSchema } from "@/modules/scenario-engine/domain/caller-utterance.schema";
import {
  ScenarioSeedSchema,
  type ScenarioSeed,
} from "@/modules/scenario-engine/domain/scenario-seed.schema";

const ASSISTANT_CARD_FIELDS = [
  "object_type",
  "landmarks",
  "caller_name",
  "caller_phone",
  "caller_type",
  "dispatcher_notes",
  "category",
  "clarification",
  "started_at",
  "victims_total",
  "children_count",
  "victims_condition",
] as const satisfies readonly (typeof INCIDENT_CARD_FIELDS)[number][];

const AssistantCardFieldSchema = z.enum([...ASSISTANT_CARD_FIELDS, "none"]);

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
    openingLine: CallerUtteranceSchema,
    fallbackLine: CallerUtteranceSchema,
    expectedServices: z.array(z.enum(EMERGENCY_SERVICES)).min(1).max(4),
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

const MANUAL_LOCATION_VALIDATION_PLACEHOLDER: ScenarioSeed["location"] = {
  terrain: "city_block",
  exactAddress: {},
  exactPoint: [55.7558, 37.6173],
  locatorCenter: [55.7558, 37.6173],
  locatorRadiusMeters: 500,
  locatorLabel: "Manual location selection",
  locatorAccuracy: "approximate",
  callerNumber: "+7 000 000-00-00",
  previouslyCalled: false,
};

export const ScenarioAssistantDraftSchema = z
  .object({
    code: ScenarioSeedSchema.shape.code,
    title: ScenarioSeedSchema.shape.title,
    category: ScenarioSeedSchema.shape.category,
    difficulty: ScenarioSeedSchema.shape.difficulty,
    summary: ScenarioSeedSchema.shape.summary,
    persona: ScenarioSeedSchema.shape.persona,
    version: ScenarioSeedSchema.shape.version,
    escalation: ScenarioSeedSchema.shape.escalation,
    facts: ScenarioSeedSchema.shape.facts,
    mandatoryQuestions: ScenarioSeedSchema.shape.mandatoryQuestions,
    referenceCard: ScenarioSeedSchema.shape.referenceCard,
  })
  .strict()
  .superRefine((draft, context) => {
    const result = ScenarioSeedSchema.safeParse({
      ...draft,
      location: MANUAL_LOCATION_VALIDATION_PLACEHOLDER,
    });

    if (!result.success) {
      result.error.issues.forEach((issue) =>
        context.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        }),
      );
    }
  });
export type ScenarioAssistantDraft = z.infer<
  typeof ScenarioAssistantDraftSchema
>;

type EmergencyService = (typeof EMERGENCY_SERVICES)[number];

const SERVICE_ALIASES = [
  { service: "fire", pattern: /пожарн|мчс/iu },
  { service: "police", pattern: /полиц|гибдд|дпс/iu },
  { service: "ambulance", pattern: /скор(?:ая|ую|ой)|медик/iu },
  { service: "gas", pattern: /газов/iu },
] as const satisfies readonly {
  service: EmergencyService;
  pattern: RegExp;
}[];

/**
 * An explicit `Службы:` clause is an author instruction, not a model choice.
 * Preserve its order and ignore any extra services suggested by the provider.
 */
export const explicitExpectedServicesFromBrief = (
  brief: string,
): EmergencyService[] | undefined => {
  const section = /(?:^|[\n.!?]\s*)служб(?:а|ы)\s*:\s*([^.!?\n]+)/iu.exec(
    brief,
  )?.[1];

  if (section === undefined) {
    return undefined;
  }

  const matches = SERVICE_ALIASES.flatMap(({ service, pattern }) => {
    const index = section.search(pattern);

    return index < 0 ? [] : [{ service, index }];
  }).sort((left, right) => left.index - right.index);

  return matches.length === 0
    ? undefined
    : matches.map(({ service }) => service);
};

/** Converts descriptive AI output into the authoritative Scenario Engine seed. */
export const buildScenarioDraftFromSuggestion = (
  code: string,
  rawSuggestion: unknown,
  authoringBrief?: string,
): ScenarioAssistantDraft => {
  const suggestion = ScenarioAssistantSuggestionSchema.parse(rawSuggestion);
  const explicitExpectedServices =
    authoringBrief === undefined
      ? undefined
      : explicitExpectedServicesFromBrief(authoringBrief);
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

  return ScenarioAssistantDraftSchema.parse({
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
      expectedServices: explicitExpectedServices ?? suggestion.expectedServices,
      referenceNotes: suggestion.referenceNotes,
      openingLine: suggestion.openingLine,
      fallbackLine: suggestion.fallbackLine,
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
