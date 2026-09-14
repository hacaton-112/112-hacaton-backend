import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ESCALATION_TRIGGERS, INCIDENT_CARD_FIELDS } from "@/drizzle/schema";
import {
  type ScenarioSeed,
  ScenarioSeedSchema,
} from "@/modules/scenario-engine/domain/scenario-seed.schema";

import {
  type StoredScenarioVersion,
  toEditableScenario,
  toScenarioVersionRows,
} from "./scenario-version-snapshot";

const SCENARIOS_DIR = join(process.cwd(), "drizzle/seed/scenarios");

/** Проверяем на тех же файлах, которыми засевается база. */
const shippedScenarios = (): ScenarioSeed[] =>
  readdirSync(SCENARIOS_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) =>
      ScenarioSeedSchema.parse(
        JSON.parse(readFileSync(join(SCENARIOS_DIR, name), "utf8")),
      ),
    );

let nextId = 0;

const rowsOf = (scenario: ScenarioSeed) =>
  toScenarioVersionRows({
    scenarioId: "scenario-1",
    scenarioVersionId: "version-2",
    personaId: "persona-2",
    version: 2,
    scenario,
    authorId: "instructor-1",
    authoringSource: "manual",
    publishedAt: new Date("2026-09-14T10:00:00.000Z"),
    generateId: () => `row-${++nextId}`,
  });

/** Как строки выглядят, когда их прочитали обратно из PostgreSQL. */
const storedFrom = (
  scenario: ScenarioSeed,
  rows = rowsOf(scenario),
): StoredScenarioVersion => ({
  scenario: {
    code: scenario.code,
    title: scenario.title,
    category: scenario.category,
    difficulty: scenario.difficulty,
    summary: scenario.summary,
  },
  version: {
    panicFloor: rows.version.panicFloor ?? 0,
    panicCeiling: rows.version.panicCeiling ?? 4,
    maxInterruptions: rows.version.maxInterruptions ?? 3,
    initiativeCooldownSeconds: rows.version.initiativeCooldownSeconds ?? 12,
    answerNormSeconds: rows.version.answerNormSeconds ?? 240,
    expectedDurationSeconds: rows.version.expectedDurationSeconds ?? 360,
    passThreshold: rows.version.passThreshold ?? 75,
    expectedServices: rows.version.expectedServices ?? [],
    referenceNotes: rows.version.referenceNotes ?? null,
    openingLine: rows.version.openingLine,
    fallbackLine: rows.version.fallbackLine,
  },
  persona: {
    code: rows.persona.code,
    displayName: rows.persona.displayName,
    gender: rows.persona.gender,
    ageYears: rows.persona.ageYears,
    condition: rows.persona.condition,
    speechStyle: rows.persona.speechStyle,
    backgroundSounds: rows.persona.backgroundSounds ?? null,
    voiceId: rows.persona.voiceId,
    baselinePanicLevel: rows.persona.baselinePanicLevel ?? 1,
    baseSpeechRate: rows.persona.baseSpeechRate ?? "1.00",
  },
  location: {
    terrain: rows.location.terrain,
    exactAddress: rows.location.exactAddress,
    exactLat: rows.location.exactLat,
    exactLon: rows.location.exactLon,
    locatorCenterLat: rows.location.locatorCenterLat,
    locatorCenterLon: rows.location.locatorCenterLon,
    locatorRadiusMeters: rows.location.locatorRadiusMeters,
    locatorLabel: rows.location.locatorLabel,
    locatorAccuracy: rows.location.locatorAccuracy ?? "identified",
    callerNumber: rows.location.callerNumber,
    previouslyCalled: rows.location.previouslyCalled ?? false,
  },
  // База не обещает порядок строк: переставляем, чтобы порядок восстанавливал
  // именно маппинг, а не удачное совпадение.
  facts: [...rows.facts].reverse().map((fact) => ({
    key: fact.key,
    promptValue: fact.promptValue,
    displayLabel: fact.displayLabel,
    severity: fact.severity ?? "normal",
    cardField: fact.cardField ?? null,
    cardValue: fact.cardValue ?? null,
    contentKeywords: fact.contentKeywords ?? [],
    disclosure: fact.disclosure,
    priority: fact.priority ?? 0,
    orderIndex: fact.orderIndex ?? 0,
  })),
  escalationRules: [...rows.escalationRules].reverse().map((rule) => ({
    trigger: rule.trigger,
    direction: rule.direction,
    params: rule.params ?? null,
    cooldownSeconds: rule.cooldownSeconds ?? 10,
  })),
  mandatoryQuestions: [...rows.mandatoryQuestions]
    .reverse()
    .map((question) => ({
      orderIndex: question.orderIndex,
      text: question.text,
      satisfiedByFactKeys: question.satisfiedByFactKeys,
      isCritical: question.isCritical ?? false,
    })),
  referenceCardFields: [...rows.referenceCardFields].reverse().map((field) => ({
    field: field.field,
    expectedValue: field.expectedValue,
    acceptableValues: field.acceptableValues ?? [],
    comparison: field.comparison ?? "normalized",
    isRequired: field.isRequired ?? true,
    sourceFactKey: field.sourceFactKey ?? null,
  })),
});

/**
 * Что должно вернуться после записи и чтения.
 *
 * У версии один столбец заметок, поэтому заметка к эталону переезжает в
 * заметку версии, если своей у версии нет. Правила и поля эталона идут в
 * порядке справочника: столбца порядка у них нет.
 */
const expectedAfterStorage = (scenario: ScenarioSeed): ScenarioSeed => {
  const referenceNotes =
    scenario.version.referenceNotes ?? scenario.referenceCard.notes;
  const { notes: _notes, ...referenceCard } = scenario.referenceCard;

  return {
    ...scenario,
    version: {
      ...scenario.version,
      ...(referenceNotes === undefined ? {} : { referenceNotes }),
    },
    escalation: [...scenario.escalation].sort(
      (left, right) =>
        ESCALATION_TRIGGERS.indexOf(left.trigger) -
        ESCALATION_TRIGGERS.indexOf(right.trigger),
    ),
    referenceCard: {
      ...referenceCard,
      fields: [...referenceCard.fields].sort(
        (left, right) =>
          INCIDENT_CARD_FIELDS.indexOf(left.field) -
          INCIDENT_CARD_FIELDS.indexOf(right.field),
      ),
    },
  };
};

describe("scenario version snapshot", () => {
  it.each(shippedScenarios().map((scenario) => [scenario.code, scenario]))(
    "brings %s back from its rows exactly as it can be published again",
    (_code, scenario) => {
      expect(toEditableScenario(storedFrom(scenario))).toEqual({
        scenario: expectedAfterStorage(scenario),
        issues: [],
      });
    },
  );

  it("writes the persona as a row of the version itself", () => {
    const [scenario] = shippedScenarios();
    const rows = rowsOf(scenario);

    expect(rows.persona.id).toBe("persona-2");
    expect(rows.version.personaId).toBe("persona-2");
    expect(rows.persona.code).toBe(scenario.persona.code);
  });

  it("records who published the version and when", () => {
    const [scenario] = shippedScenarios();
    const rows = rowsOf(scenario);

    expect(rows.version).toMatchObject({
      version: 2,
      publishedBy: "instructor-1",
      reviewedBy: "instructor-1",
      publishedAt: new Date("2026-09-14T10:00:00.000Z"),
      authoringSource: "manual",
      authoringPrompt: null,
    });
  });

  it("refuses a stored rule the engine would refuse too", () => {
    const [scenario] = shippedScenarios();
    const stored = storedFrom(scenario);
    const broken: StoredScenarioVersion = {
      ...stored,
      facts: stored.facts.map((fact, index) =>
        index === 0
          ? { ...fact, disclosure: { type: "after_fact", factKeys: ["x"] } }
          : fact,
      ),
    };

    // С таким правилом версию не запустит и сам движок: чинить её редактором
    // нечего, это порча данных.
    expect(() => toEditableScenario(broken)).toThrow();
  });

  it("opens a version that breaks today's rules and says what is wrong", () => {
    const [scenario] = shippedScenarios();
    const stored = storedFrom(scenario);
    const outdated: StoredScenarioVersion = {
      ...stored,
      version: { ...stored.version, panicFloor: 4, panicCeiling: 1 },
    };

    // Правила строже, чем были при публикации: отказать в открытии значило бы
    // запретить именно ту правку, которая версию чинит.
    const editable = toEditableScenario(outdated);

    expect(editable.scenario.version.panicFloor).toBe(4);
    expect(editable.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["version", "panicFloor"] }),
      ]),
    );
  });
});
