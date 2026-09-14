import { z } from "zod";

import {
  EMERGENCY_SERVICES,
  FACT_SEVERITIES,
  INCIDENT_CARD_FIELDS,
  SCENARIO_CATEGORIES,
  TERRAIN_TYPES,
} from "@/drizzle/schema";
import { CallerUtteranceSchema } from "@/modules/scenario-engine/domain/caller-utterance.schema";
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
    openingLine: CallerUtteranceSchema,
    fallbackLine: CallerUtteranceSchema,
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

const METERS_PER_LATITUDE_DEGREE = 111_320;
const DEFAULT_LOCATOR_RADIUS_METERS = 500;

const shiftCoordinate = (
  value: number,
  maximum: number,
  radiusMeters: number,
): number => {
  const offset = Math.min(
    0.0015,
    radiusMeters / 4 / METERS_PER_LATITUDE_DEGREE,
  );

  return Number(
    (value > maximum - offset * 2 ? value - offset : value + offset).toFixed(6),
  );
};

type EmergencyService = (typeof EMERGENCY_SERVICES)[number];
type Terrain = (typeof TERRAIN_TYPES)[number];

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
  const section =
    /(?:^|[\n.!?]\s*)служб(?:а|ы)\s*:\s*([^.!?\n]+)/iu.exec(brief)?.[1];

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

const TERRAIN_HINTS = [
  {
    terrain: "indoor",
    pattern:
      /(?:внутри|в)\s+(?:квартир(?:е|ы)|помещени(?:и|я)|магазин(?:е|а)|офис(?:е|а)|школ(?:е|ы)|подъезд(?:е|а))/iu,
    details: "Внутри здания",
  },
  {
    terrain: "forest",
    pattern: /(?:в|из|на)\s+лес(?:у|а)?|лесн(?:ой|ая|ом)/iu,
    details: "В лесу",
  },
  {
    terrain: "open_field",
    pattern: /(?:в|на)\s+пол(?:е|я)|открыт(?:ая|ой)\s+местност/iu,
    details: "В открытой местности",
  },
  {
    terrain: "highway",
    pattern: /трасс|шоссе|автомагистрал/iu,
    details: "На трассе",
  },
  {
    terrain: "city_block",
    pattern:
      /(?:во|в)\s+двор(?:е|а|у|ом)?|у\s+подъезд(?:а|ом)?|жил(?:ом|ой)\s+квартал/iu,
    details: "Во дворе",
  },
  {
    terrain: "city_dense",
    pattern: /центр(?:е|а)?\s+город|плотн(?:ая|ой)\s+застройк/iu,
    details: "В плотной городской застройке",
  },
] as const satisfies readonly {
  terrain: Terrain;
  pattern: RegExp;
  details: string;
}[];

export interface ExplicitLocationHints {
  readonly terrain?: Terrain;
  readonly exactAddressDetails?: string;
  readonly locatorRadiusMeters?: number;
  readonly locatorLabel?: string;
}

/** Explicit author wording wins over a plausible but invented model location. */
export const explicitLocationHintsFromBrief = (
  brief: string,
): ExplicitLocationHints => {
  const terrainHint = TERRAIN_HINTS.find(({ pattern }) => pattern.test(brief));
  const locatorClause =
    /(?:^|[\n.!?]\s*)локатор\s*[-–—:]?\s*([^.!?\n]+)/iu.exec(brief)?.[1];
  const radiusMatch =
    locatorClause === undefined
      ? undefined
      : /(?:круг|радиус(?:ом)?|погрешност[ьи]?)\s*(?:в\s*)?(\d{1,5})\s*(?:м|метр(?:а|ов)?)/iu.exec(
          locatorClause,
        );
  const parsedRadius = radiusMatch?.[1] === undefined
    ? undefined
    : Number(radiusMatch[1]);
  const locatorRadiusMeters =
    parsedRadius !== undefined && parsedRadius >= 10 && parsedRadius <= 50_000
      ? parsedRadius
      : undefined;
  const hasMobileLocator =
    locatorClause !== undefined && /мобильн/iu.test(locatorClause);

  return {
    ...(terrainHint === undefined
      ? {}
      : {
          terrain: terrainHint.terrain,
          exactAddressDetails: terrainHint.details,
        }),
    ...(locatorRadiusMeters === undefined ? {} : { locatorRadiusMeters }),
    ...(hasMobileLocator
      ? {
          locatorLabel:
            locatorRadiusMeters === undefined
              ? "Мобильный локатор"
              : `Мобильный локатор: круг ${locatorRadiusMeters} м`,
        }
      : {}),
  };
};

/** Converts descriptive AI output into the authoritative Scenario Engine seed. */
export const buildScenarioSeedFromSuggestion = (
  code: string,
  rawSuggestion: unknown,
  authoringBrief?: string,
): ScenarioSeed => {
  const suggestion = ScenarioAssistantSuggestionSchema.parse(rawSuggestion);
  const explicitExpectedServices =
    authoringBrief === undefined
      ? undefined
      : explicitExpectedServicesFromBrief(authoringBrief);
  const explicitLocation =
    authoringBrief === undefined
      ? {}
      : explicitLocationHintsFromBrief(authoringBrief);
  const locatorRadiusMeters =
    explicitLocation.locatorRadiusMeters ?? DEFAULT_LOCATOR_RADIUS_METERS;
  const exactAddress = Object.fromEntries(
    Object.entries({
      city: suggestion.location.city,
      street: suggestion.location.street,
      house: suggestion.location.house,
      details:
        explicitLocation.exactAddressDetails ?? suggestion.location.details,
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
      expectedServices:
        explicitExpectedServices ?? suggestion.expectedServices,
      referenceNotes: suggestion.referenceNotes,
      openingLine: suggestion.openingLine,
      fallbackLine: suggestion.fallbackLine,
    },
    location: {
      terrain: explicitLocation.terrain ?? suggestion.location.terrain,
      exactAddress,
      exactPoint: [
        suggestion.location.exactPoint.lat,
        suggestion.location.exactPoint.lon,
      ],
      locatorCenter: [
        shiftCoordinate(
          suggestion.location.exactPoint.lat,
          90,
          locatorRadiusMeters,
        ),
        shiftCoordinate(
          suggestion.location.exactPoint.lon,
          180,
          locatorRadiusMeters,
        ),
      ],
      locatorRadiusMeters,
      locatorLabel:
        explicitLocation.locatorLabel ?? suggestion.location.locatorLabel,
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
