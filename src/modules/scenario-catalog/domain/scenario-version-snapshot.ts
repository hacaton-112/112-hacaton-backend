import {
  type CallerPersonaRecord,
  ESCALATION_TRIGGERS,
  type EscalationRuleRecord,
  INCIDENT_CARD_FIELDS,
  type MandatoryQuestionRecord,
  type NewCallerPersonaRecord,
  type NewEscalationRuleRecord,
  type NewMandatoryQuestionRecord,
  type NewReferenceCardFieldRecord,
  type NewScenarioFactRecord,
  type NewScenarioLocationRecord,
  type NewScenarioVersionRecord,
  type ReferenceCardFieldRecord,
  type ScenarioFactRecord,
  type ScenarioLocationRecord,
  type ScenarioRecord,
  type ScenarioVersionRecord,
} from "@/drizzle/schema";
import { DisclosureRuleSchema } from "@/modules/scenario-engine/domain/disclosure";
import { EscalationParamsSchema } from "@/modules/scenario-engine/domain/escalation-params";
import {
  type ScenarioSeed,
  ScenarioSeedSchema,
} from "@/modules/scenario-engine/domain/scenario-seed.schema";

export interface ScenarioVersionRowsInput {
  readonly scenarioId: string;
  readonly scenarioVersionId: string;
  readonly personaId: string;
  readonly version: number;
  readonly scenario: ScenarioSeed;
  readonly authorId: string;
  readonly authoringSource: "manual" | "assistant";
  readonly authoringPrompt?: string;
  readonly publishedAt: Date;
  readonly generateId: () => string;
}

/** Всё, что составляет одну опубликованную версию, построчно по таблицам. */
export interface ScenarioVersionRows {
  readonly persona: NewCallerPersonaRecord;
  readonly version: NewScenarioVersionRecord;
  readonly location: NewScenarioLocationRecord;
  readonly facts: readonly NewScenarioFactRecord[];
  readonly escalationRules: readonly NewEscalationRuleRecord[];
  readonly mandatoryQuestions: readonly NewMandatoryQuestionRecord[];
  readonly referenceCardFields: readonly NewReferenceCardFieldRecord[];
}

/**
 * Раскладывает сценарий по таблицам версии.
 *
 * Персонаж пишется новой строкой вместе с каждой версией: иначе правка голоса
 * или манеры речи задним числом меняла бы звонки, уже проведённые по прошлой
 * версии.
 */
export const toScenarioVersionRows = ({
  scenarioId,
  scenarioVersionId,
  personaId,
  version,
  scenario,
  authorId,
  authoringSource,
  authoringPrompt,
  publishedAt,
  generateId,
}: ScenarioVersionRowsInput): ScenarioVersionRows => ({
  persona: {
    id: personaId,
    code: scenario.persona.code,
    displayName: scenario.persona.displayName,
    gender: scenario.persona.gender,
    ageYears: scenario.persona.ageYears,
    condition: scenario.persona.condition,
    speechStyle: scenario.persona.speechStyle,
    backgroundSounds: scenario.persona.backgroundSounds ?? null,
    voiceId: scenario.persona.voiceId,
    baselinePanicLevel: scenario.persona.baselinePanicLevel,
    baseSpeechRate: scenario.persona.baseSpeechRate.toFixed(2),
  },
  version: {
    id: scenarioVersionId,
    scenarioId,
    version,
    personaId,
    panicFloor: scenario.version.panicFloor,
    panicCeiling: scenario.version.panicCeiling,
    maxInterruptions: scenario.version.maxInterruptions,
    initiativeCooldownSeconds: scenario.version.initiativeCooldownSeconds,
    answerNormSeconds: scenario.version.answerNormSeconds,
    expectedDurationSeconds: scenario.version.expectedDurationSeconds,
    passThreshold: scenario.version.passThreshold,
    expectedServices: scenario.version.expectedServices,
    referenceNotes:
      scenario.version.referenceNotes ?? scenario.referenceCard.notes ?? null,
    openingLine: scenario.version.openingLine,
    fallbackLine: scenario.version.fallbackLine,
    authoringSource,
    authoringPrompt: authoringPrompt ?? null,
    reviewedBy: authorId,
    reviewedAt: publishedAt,
    publishedBy: authorId,
    publishedAt,
  },
  location: {
    scenarioVersionId,
    terrain: scenario.location.terrain,
    exactAddress: scenario.location.exactAddress,
    exactLat: scenario.location.exactPoint[0].toFixed(6),
    exactLon: scenario.location.exactPoint[1].toFixed(6),
    locatorCenterLat: scenario.location.locatorCenter[0].toFixed(6),
    locatorCenterLon: scenario.location.locatorCenter[1].toFixed(6),
    locatorRadiusMeters: scenario.location.locatorRadiusMeters,
    locatorLabel: scenario.location.locatorLabel,
    locatorAccuracy: scenario.location.locatorAccuracy,
    callerNumber: scenario.location.callerNumber,
    previouslyCalled: scenario.location.previouslyCalled,
  },
  facts: scenario.facts.map((fact, orderIndex) => ({
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
  escalationRules: scenario.escalation.map((rule) => ({
    id: generateId(),
    scenarioVersionId,
    trigger: rule.trigger,
    direction: rule.direction,
    params: rule.params ?? null,
    cooldownSeconds: rule.cooldownSeconds,
  })),
  mandatoryQuestions: scenario.mandatoryQuestions.map(
    (question, orderIndex) => ({
      id: generateId(),
      scenarioVersionId,
      orderIndex,
      text: question.text,
      satisfiedByFactKeys: question.satisfiedByFactKeys,
      isCritical: question.isCritical,
    }),
  ),
  referenceCardFields: scenario.referenceCard.fields.map((field) => ({
    id: generateId(),
    scenarioVersionId,
    field: field.field,
    expectedValue: field.expectedValue,
    acceptableValues: field.acceptableValues,
    comparison: field.comparison,
    isRequired: field.isRequired,
    sourceFactKey: field.sourceFactKey,
  })),
});

/** Строки опубликованной версии в том виде, в каком их отдаёт база. */
export interface StoredScenarioVersion {
  readonly scenario: Pick<
    ScenarioRecord,
    "code" | "title" | "category" | "difficulty" | "summary"
  >;
  readonly version: Pick<
    ScenarioVersionRecord,
    | "panicFloor"
    | "panicCeiling"
    | "maxInterruptions"
    | "initiativeCooldownSeconds"
    | "answerNormSeconds"
    | "expectedDurationSeconds"
    | "passThreshold"
    | "expectedServices"
    | "referenceNotes"
    | "openingLine"
    | "fallbackLine"
  >;
  readonly persona: Pick<
    CallerPersonaRecord,
    | "code"
    | "displayName"
    | "gender"
    | "ageYears"
    | "condition"
    | "speechStyle"
    | "backgroundSounds"
    | "voiceId"
    | "baselinePanicLevel"
    | "baseSpeechRate"
  >;
  readonly location: Omit<ScenarioLocationRecord, "scenarioVersionId">;
  readonly facts: readonly Omit<
    ScenarioFactRecord,
    "id" | "scenarioVersionId"
  >[];
  readonly escalationRules: readonly Pick<
    EscalationRuleRecord,
    "trigger" | "direction" | "params" | "cooldownSeconds"
  >[];
  readonly mandatoryQuestions: readonly Pick<
    MandatoryQuestionRecord,
    "orderIndex" | "text" | "satisfiedByFactKeys" | "isCritical"
  >[];
  readonly referenceCardFields: readonly Omit<
    ReferenceCardFieldRecord,
    "id" | "scenarioVersionId"
  >[];
}

const byOrder =
  <T>(order: readonly T[]) =>
  (left: T, right: T): number =>
    order.indexOf(left) - order.indexOf(right);

/** Чем версия расходится с сегодняшними правилами сценария. */
export interface ScenarioIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export interface EditableScenario {
  readonly scenario: ScenarioSeed;
  /** Пусто, если версию можно опубликовать снова без единой правки. */
  readonly issues: readonly ScenarioIssue[];
}

/**
 * Собирает сценарий обратно из строк версии — ту же форму, которую принимает
 * публикация.
 *
 * Правила сценария со временем строже: версия, опубликованная год назад,
 * сегодняшнюю схему может не пройти. Отказать в её открытии значило бы
 * запретить именно ту правку, которая её чинит, поэтому такая версия отдаётся
 * как есть вместе со списком расхождений, а публикация проверяет её как любую
 * другую. Условия раскрытия и параметры эскалации проверяются строго: с битым
 * правилом версию не запустит и сам движок.
 *
 * У правил эскалации и полей эталона нет столбца порядка, поэтому они
 * упорядочиваются по справочнику: без этого одна и та же версия приходила бы в
 * редактор то в одном порядке, то в другом.
 */
export const toEditableScenario = (
  stored: StoredScenarioVersion,
): EditableScenario => {
  const candidate: ScenarioSeed = {
    code: stored.scenario.code,
    title: stored.scenario.title,
    category: stored.scenario.category,
    difficulty: stored.scenario.difficulty,
    summary: stored.scenario.summary,
    persona: {
      code: stored.persona.code,
      gender: stored.persona.gender,
      displayName: stored.persona.displayName,
      ageYears: stored.persona.ageYears,
      condition: stored.persona.condition,
      speechStyle: stored.persona.speechStyle,
      ...(stored.persona.backgroundSounds === null
        ? {}
        : { backgroundSounds: stored.persona.backgroundSounds }),
      voiceId: stored.persona.voiceId,
      baselinePanicLevel: stored.persona.baselinePanicLevel,
      baseSpeechRate: Number(stored.persona.baseSpeechRate),
    },
    version: {
      panicFloor: stored.version.panicFloor,
      panicCeiling: stored.version.panicCeiling,
      maxInterruptions: stored.version.maxInterruptions,
      initiativeCooldownSeconds: stored.version.initiativeCooldownSeconds,
      answerNormSeconds: stored.version.answerNormSeconds,
      expectedDurationSeconds: stored.version.expectedDurationSeconds,
      passThreshold: stored.version.passThreshold,
      expectedServices: stored.version.expectedServices,
      ...(stored.version.referenceNotes === null
        ? {}
        : { referenceNotes: stored.version.referenceNotes }),
      openingLine: stored.version.openingLine,
      fallbackLine: stored.version.fallbackLine,
    },
    location: {
      terrain: stored.location.terrain,
      exactAddress: stored.location.exactAddress,
      exactPoint: [
        Number(stored.location.exactLat),
        Number(stored.location.exactLon),
      ],
      locatorCenter: [
        Number(stored.location.locatorCenterLat),
        Number(stored.location.locatorCenterLon),
      ],
      locatorRadiusMeters: stored.location.locatorRadiusMeters,
      locatorLabel: stored.location.locatorLabel,
      locatorAccuracy: stored.location.locatorAccuracy,
      callerNumber: stored.location.callerNumber,
      previouslyCalled: stored.location.previouslyCalled,
    },
    escalation: [...stored.escalationRules]
      .sort((left, right) =>
        byOrder(ESCALATION_TRIGGERS)(left.trigger, right.trigger),
      )
      .map((rule) => ({
        trigger: rule.trigger,
        direction: rule.direction,
        cooldownSeconds: rule.cooldownSeconds,
        ...(rule.params === null
          ? {}
          : { params: EscalationParamsSchema.parse(rule.params) }),
      })),
    facts: [...stored.facts]
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((fact) => ({
        key: fact.key,
        promptValue: fact.promptValue,
        displayLabel: fact.displayLabel,
        severity: fact.severity,
        cardField: fact.cardField,
        cardValue: fact.cardValue,
        contentKeywords: fact.contentKeywords,
        disclosure: DisclosureRuleSchema.parse(fact.disclosure),
        priority: fact.priority,
      })),
    mandatoryQuestions: [...stored.mandatoryQuestions]
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((question) => ({
        text: question.text,
        satisfiedByFactKeys: question.satisfiedByFactKeys,
        isCritical: question.isCritical,
      })),
    referenceCard: {
      fields: [...stored.referenceCardFields]
        .sort((left, right) =>
          byOrder(INCIDENT_CARD_FIELDS)(left.field, right.field),
        )
        .map((field) => ({
          field: field.field,
          expectedValue: field.expectedValue,
          acceptableValues: field.acceptableValues,
          comparison: field.comparison,
          isRequired: field.isRequired,
          sourceFactKey: field.sourceFactKey,
        })),
    },
  };
  const parsed = ScenarioSeedSchema.safeParse(candidate);

  return parsed.success
    ? { scenario: parsed.data, issues: [] }
    : {
        scenario: candidate,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.map((segment) =>
            typeof segment === "number" ? segment : String(segment),
          ),
          message: issue.message,
        })),
      };
};
