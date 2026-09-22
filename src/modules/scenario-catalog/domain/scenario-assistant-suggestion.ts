import { z } from "zod";

import { EMERGENCY_SERVICES, SCENARIO_CATEGORIES } from "@/drizzle/schema";
import { CallerUtteranceSchema } from "@/modules/scenario-engine/domain/caller-utterance.schema";
import {
  ScenarioSeedSchema,
  type ScenarioSeed,
} from "@/modules/scenario-engine/domain/scenario-seed.schema";

import { buildIncidentScenario } from "./incident-scenario";

/**
 * Вводная, которую пишет модель: только суть происшествия.
 *
 * Раньше модель заполняла персонажа, 3–12 фактов с ключевыми словами и
 * обязательные вопросы со ссылками на ключи фактов — тысячу с лишним
 * токенов на попытку, около минуты на CPU, и ошибалась в перекрёстных
 * ссылках. Теперь ответ умещается в пару сотен токенов, а полный сценарий
 * собирает buildIncidentScenario по тем же правилам, что и билеты.
 */
export const ScenarioAssistantSuggestionSchema = z
  .object({
    title: z.string().min(3).max(120),
    category: z.enum(SCENARIO_CATEGORIES),
    difficulty: z.number().int().min(1).max(5),
    situation: z.string().min(10).max(400),
    caller: z
      .object({
        name: z.string().min(2).max(80),
        gender: z.enum(["male", "female"]),
        age: z.number().int().min(10).max(100),
      })
      .strict(),
    victims: z.number().int().min(0).max(50).nullable(),
    services: z.array(z.enum(EMERGENCY_SERVICES)).min(1).max(4),
    details: z.array(z.string().min(2).max(200)).max(5),
    openingLine: CallerUtteranceSchema,
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

  return ScenarioAssistantDraftSchema.parse(
    buildIncidentScenario({
      code,
      title: suggestion.title,
      situation: suggestion.situation,
      opening: suggestion.openingLine,
      category: suggestion.category,
      difficulty: suggestion.difficulty,
      services: explicitExpectedServices ?? suggestion.services,
      caller: suggestion.caller,
      victims: suggestion.victims,
      details: suggestion.details,
    }),
  );
};

/** JSON Schema sent to the provider; Zod remains authoritative after output. */
export const scenarioAssistantJsonSchema = (): Record<string, unknown> => {
  const { $schema: _, ...schema } = z.toJSONSchema(
    ScenarioAssistantSuggestionSchema,
  );

  return schema;
};
