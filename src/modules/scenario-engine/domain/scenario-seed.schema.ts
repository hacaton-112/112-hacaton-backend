import { z } from "zod";

import { findQwenTtsVoice, FactIdSchema } from "@/contracts";
import {
  CALLER_GENDERS,
  EMERGENCY_SERVICES,
  ESCALATION_DIRECTIONS,
  ESCALATION_TRIGGERS,
  FACT_SEVERITIES,
  INCIDENT_CARD_FIELDS,
  LOCATOR_ACCURACIES,
  REFERENCE_COMPARISONS,
  SCENARIO_CATEGORIES,
  TERRAIN_TYPES,
} from "@/drizzle/schema";

import { CallerUtteranceSchema } from "./caller-utterance.schema";
import { DisclosureRuleSchema } from "./disclosure";
import { EscalationParamsSchema } from "./escalation-params";
import { PANIC_LEVELS } from "./panic-scale";

const PanicLevelSchema = z
  .number()
  .int()
  .refine(
    (value) => PANIC_LEVELS.includes(value as (typeof PANIC_LEVELS)[number]),
    {
      message: "Panic level must be between 0 and 4",
    },
  );

const CoordinatesSchema = z.tuple([
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
]);

const isUnsetCoordinates = ([latitude, longitude]: [number, number]): boolean =>
  latitude === 0 && longitude === 0;

const distanceBetweenCoordinates = (
  [fromLatitude, fromLongitude]: [number, number],
  [toLatitude, toLongitude]: [number, number],
): number => {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const fromLatitudeRadians = toRadians(fromLatitude);
  const toLatitudeRadians = toRadians(toLatitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitudeRadians) *
      Math.cos(toLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
};

/**
 * Форма файла сценария для сида.
 *
 * Ручной ввод и черновик от помощника проходят одну и ту же схему: у
 * сгенерированного сценария не должно быть отдельной, более слабой двери.
 */
export const ScenarioSeedSchema = z
  .object({
    code: z.string().trim().min(2).max(32),
    title: z.string().trim().min(3).max(120),
    category: z.enum(SCENARIO_CATEGORIES),
    difficulty: z.number().int().min(1).max(5),
    summary: z.string().trim().min(10).max(400),
    persona: z
      .object({
        code: z.string().trim().min(2).max(64),
        gender: z.enum(CALLER_GENDERS),
        displayName: z.string().trim().min(2).max(120),
        ageYears: z.number().int().min(1).max(110),
        condition: z.string().trim().min(2).max(200),
        speechStyle: z.string().trim().min(10).max(2_000),
        backgroundSounds: z.string().trim().max(200).optional(),
        voiceId: z.string().trim().min(1).max(64),
        baselinePanicLevel: PanicLevelSchema,
        baseSpeechRate: z.number().min(0.5).max(2),
      })
      .strict()
      // Несовпадение ловится здесь, а не на занятии: мужчина, заговоривший
      // женским голосом, разрушает разбор быстрее любой ошибки в тексте.
      .refine(
        (persona) =>
          findQwenTtsVoice(persona.voiceId)?.gender === persona.gender,
        {
          message:
            "Голос персонажа неизвестен рантайму синтеза или не совпадает с его полом",
          path: ["voiceId"],
        },
      ),
    version: z
      .object({
        panicFloor: PanicLevelSchema,
        panicCeiling: PanicLevelSchema,
        maxInterruptions: z.number().int().min(0).max(20),
        initiativeCooldownSeconds: z.number().int().min(1).max(120),
        answerNormSeconds: z.number().int().min(30).max(1_800),
        expectedDurationSeconds: z.number().int().min(30).max(3_600),
        passThreshold: z.number().int().min(0).max(100),
        expectedServices: z.array(z.enum(EMERGENCY_SERVICES)).max(4),
        referenceNotes: z.string().trim().max(2_000).optional(),
        openingLine: CallerUtteranceSchema,
        fallbackLine: CallerUtteranceSchema,
      })
      .strict()
      .refine((value) => value.panicFloor <= value.panicCeiling, {
        message: "panicFloor must not exceed panicCeiling",
        path: ["panicFloor"],
      }),
    location: z
      .object({
        terrain: z.enum(TERRAIN_TYPES),
        exactAddress: z.record(z.string(), z.string()),
        exactPoint: CoordinatesSchema,
        locatorCenter: CoordinatesSchema,
        locatorRadiusMeters: z.number().int().min(10).max(50_000),
        locatorLabel: z.string().trim().min(3).max(200),
        locatorAccuracy: z.enum(LOCATOR_ACCURACIES),
        callerNumber: z.string().trim().min(3).max(32),
        previouslyCalled: z.boolean(),
      })
      .strict(),
    escalation: z
      .array(
        z
          .object({
            trigger: z.enum(ESCALATION_TRIGGERS),
            direction: z.enum(ESCALATION_DIRECTIONS),
            cooldownSeconds: z.number().int().min(0).max(600),
            params: EscalationParamsSchema.optional(),
          })
          .strict(),
      )
      .max(32),
    facts: z
      .array(
        z
          .object({
            key: FactIdSchema,
            promptValue: z.string().trim().min(2).max(1_000),
            displayLabel: z.string().trim().min(2).max(120),
            severity: z.enum(FACT_SEVERITIES).default("normal"),
            cardField: z.enum(INCIDENT_CARD_FIELDS).nullable().default(null),
            cardValue: z.string().trim().max(200).nullable().default(null),
            /** По этим словам факт засчитывается, когда заявитель его назвал. */
            contentKeywords: z
              .array(z.string().trim().min(2))
              .max(32)
              .default([]),
            disclosure: DisclosureRuleSchema,
            priority: z.number().int().min(0).max(100).default(0),
          })
          .strict(),
      )
      .min(1)
      .max(64),
    mandatoryQuestions: z
      .array(
        z
          .object({
            text: z.string().trim().min(5).max(300),
            satisfiedByFactKeys: z.array(FactIdSchema).min(1).max(16),
            isCritical: z.boolean().default(false),
          })
          .strict(),
      )
      .max(32),
    referenceCard: z
      .object({
        fields: z
          .array(
            z
              .object({
                field: z.enum(INCIDENT_CARD_FIELDS),
                expectedValue: z.string().trim().min(1).max(200),
                acceptableValues: z.array(z.string().trim().min(1)).default([]),
                comparison: z.enum(REFERENCE_COMPARISONS).default("normalized"),
                isRequired: z.boolean().default(true),
                sourceFactKey: FactIdSchema.nullable().default(null),
              })
              .strict(),
          )
          .max(32),
        notes: z.string().trim().max(2_000).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((scenario, context) => {
    const keys = new Set(scenario.facts.map((fact) => fact.key));

    if (keys.size !== scenario.facts.length) {
      context.addIssue({
        code: "custom",
        path: ["facts"],
        message: "Fact keys must be unique",
      });
    }

    const referenceFields = new Set(
      scenario.referenceCard.fields.map((field) => field.field),
    );

    if (referenceFields.size !== scenario.referenceCard.fields.length) {
      context.addIssue({
        code: "custom",
        path: ["referenceCard", "fields"],
        message: "Reference card fields must be unique",
      });
    }

    if (
      scenario.persona.baselinePanicLevel < scenario.version.panicFloor ||
      scenario.persona.baselinePanicLevel > scenario.version.panicCeiling
    ) {
      context.addIssue({
        code: "custom",
        path: ["persona", "baselinePanicLevel"],
        message: "Baseline panic level must be inside the version panic range",
      });
    }

    if (isUnsetCoordinates(scenario.location.exactPoint)) {
      context.addIssue({
        code: "custom",
        path: ["location", "exactPoint"],
        message: "Select the incident point on the map",
      });
    }

    if (isUnsetCoordinates(scenario.location.locatorCenter)) {
      context.addIssue({
        code: "custom",
        path: ["location", "locatorCenter"],
        message: "Select the locator range centre on the map",
      });
    }

    if (
      !isUnsetCoordinates(scenario.location.exactPoint) &&
      !isUnsetCoordinates(scenario.location.locatorCenter) &&
      distanceBetweenCoordinates(
        scenario.location.exactPoint,
        scenario.location.locatorCenter,
      ) > scenario.location.locatorRadiusMeters
    ) {
      context.addIssue({
        code: "custom",
        path: ["location", "locatorCenter"],
        message: "The incident point must be inside the locator range",
      });
    }

    // Ссылка на несуществующий факт превратила бы обязательный вопрос в
    // невыполнимый.
    scenario.mandatoryQuestions.forEach((question, index) => {
      for (const key of question.satisfiedByFactKeys) {
        if (!keys.has(key)) {
          context.addIssue({
            code: "custom",
            path: ["mandatoryQuestions", index, "satisfiedByFactKeys"],
            message: `Unknown fact key: ${key}`,
          });
        }
      }
    });

    scenario.referenceCard.fields.forEach((field, index) => {
      if (field.sourceFactKey !== null && !keys.has(field.sourceFactKey)) {
        context.addIssue({
          code: "custom",
          path: ["referenceCard", "fields", index, "sourceFactKey"],
          message: `Unknown fact key: ${field.sourceFactKey}`,
        });
      }
    });
  });

export type ScenarioSeed = z.infer<typeof ScenarioSeedSchema>;
