import { describe, expect, it } from "bun:test";

import {
  createEmptyScenario,
  EditableScenarioVersionSchema,
  GenerateScenarioDraftResponseSchema,
  mergeScenarioAssistantDraft,
  ReverseGeocodedAddressSchema,
  ScenarioAssistantDraftSchema,
  ScenarioSeedSchema,
  scenarioForEditing,
  type ScenarioSeed,
} from "../src/contracts/scenario-authoring";

const validScenario = (): ScenarioSeed => ({
  ...createEmptyScenario(),
  code: "S-FIRE-TEST",
  title: "Пожар в учебной мастерской",
  summary: "Задымление в учебной мастерской с одним пострадавшим.",
  category: "fire",
  persona: {
    ...createEmptyScenario().persona,
    code: "s-fire-test-caller",
    displayName: "Елена Учебная",
    condition: "Напугана, находится снаружи",
    speechStyle: "Говорит коротко, сбивается и просит прислать помощь.",
  },
  version: {
    ...createEmptyScenario().version,
    openingLine: "Алло, у нас дым в мастерской!",
    fallbackLine: "Я не знаю, пожалуйста, приезжайте скорее.",
    expectedServices: ["fire", "ambulance"],
  },
  location: {
    ...createEmptyScenario().location,
    exactPoint: [55.75, 37.61],
    locatorCenter: [55.751, 37.611],
    locatorLabel: "Базовая станция: Учебный квартал",
  },
  facts: [
    {
      key: "incident_type",
      promptValue: "В мастерской сильное задымление.",
      displayLabel: "Тип происшествия",
      severity: "normal",
      cardField: "category",
      cardValue: "пожар",
      contentKeywords: ["дым", "мастерск"],
      disclosure: { type: "immediate" },
      priority: 10,
    },
  ],
  mandatoryQuestions: [
    {
      text: "Уточнить тип происшествия",
      satisfiedByFactKeys: ["incident_type"],
      isCritical: true,
    },
  ],
  referenceCard: {
    fields: [
      {
        field: "category",
        expectedValue: "пожар",
        acceptableValues: ["возгорание"],
        comparison: "normalized",
        isRequired: true,
        sourceFactKey: "incident_type",
      },
    ],
    notes: "Проверить классификацию происшествия.",
  },
});

describe("ReverseGeocodedAddressSchema", () => {
  it("accepts a normalized OpenStreetMap address", () => {
    expect(
      ReverseGeocodedAddressSchema.parse({
        city: "Москва",
        street: "Красная площадь",
        house: "1",
        displayName: "1, Красная площадь, Москва, Россия",
        attribution: "© OpenStreetMap contributors",
      }),
    ).toMatchObject({ city: "Москва", street: "Красная площадь" });
  });

  it("rejects an unattributed provider response", () => {
    expect(
      ReverseGeocodedAddressSchema.safeParse({
        city: "Москва",
        displayName: "Москва, Россия",
        attribution: "unknown",
      }).success,
    ).toBe(false);
  });
});

describe("ScenarioSeedSchema", () => {
  it("accepts a complete scenario from the constructor", () => {
    expect(ScenarioSeedSchema.parse(validScenario()).code).toBe("S-FIRE-TEST");
  });

  it("no longer offers the rule that chained one fact to another", () => {
    const scenario = validScenario();
    // The backend dropped after_fact: a constructor that still produced it
    // would publish a scenario the engine refuses to load.
    (scenario.facts[0] as { disclosure: unknown }).disclosure = {
      type: "after_fact",
      factKeys: ["incident_type"],
    };

    expect(ScenarioSeedSchema.safeParse(scenario).success).toBe(false);
  });

  it("rejects cross-references to facts that do not exist", () => {
    const scenario = validScenario();
    scenario.mandatoryQuestions[0].satisfiedByFactKeys = ["missing"];

    expect(ScenarioSeedSchema.safeParse(scenario).success).toBe(false);
  });

  it("keeps location outside the assistant response contract", () => {
    const { location, ...assistantDraft } = validScenario();

    expect(
      GenerateScenarioDraftResponseSchema.safeParse({
        scenario: assistantDraft,
        authoringPrompt:
          "Сформируй синтетический учебный пожар в мастерской с пострадавшим.",
      }).success,
    ).toBe(true);
    expect(Object.keys(ScenarioAssistantDraftSchema.shape)).not.toContain(
      "location",
    );
    expect(
      GenerateScenarioDraftResponseSchema.safeParse({
        scenario: validScenario(),
        authoringPrompt:
          "Сформируй синтетический учебный пожар в мастерской с пострадавшим.",
      }).success,
    ).toBe(false);
    expect(
      mergeScenarioAssistantDraft(createEmptyScenario(), assistantDraft)
        .location,
    ).toEqual(createEmptyScenario().location);
    expect(location.exactPoint).toEqual([55.75, 37.61]);
  });
});

describe("EditableScenarioVersionSchema", () => {
  const version = () => ({
    scenarioId: "5b6c3f2e-0f7a-4d4b-9a3e-1f0c2d3e4f50",
    scenarioVersionId: "7d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6",
    version: 3,
    isLatest: true,
    publishedAt: "2026-09-14T10:00:00.000Z",
    authoringSource: "manual",
    scenario: validScenario(),
  });

  it("accepts a published version the backend hands over for editing", () => {
    expect(EditableScenarioVersionSchema.parse(version()).version).toBe(3);
  });

  it("tolerates a field a newer backend adds", () => {
    expect(
      EditableScenarioVersionSchema.safeParse({
        ...version(),
        reviewedBy: "instructor-1",
      }).success,
    ).toBe(true);
  });

  it("opens a version that breaks today's rules, together with its issues", () => {
    const outdated = {
      ...version(),
      scenario: { ...validScenario(), facts: [] },
      issues: [{ path: ["facts"], message: "Добавьте хотя бы один факт" }],
    };

    // Otherwise exactly the version that needs fixing could not be opened.
    const parsed = EditableScenarioVersionSchema.parse(outdated);

    expect(parsed.scenario.facts).toEqual([]);
    expect(parsed.issues).toHaveLength(1);
  });

  it("treats a version without listed issues as clean", () => {
    const { issues: _issues, ...withoutIssues } = {
      ...version(),
      issues: undefined,
    };

    expect(EditableScenarioVersionSchema.parse(withoutIssues).issues).toEqual(
      [],
    );
  });

  it("refuses a response that carries no scenario at all", () => {
    expect(
      EditableScenarioVersionSchema.safeParse({ ...version(), scenario: null })
        .success,
    ).toBe(false);
  });
});

describe("scenarioForEditing", () => {
  it("shows the stored version note in the reference notes editor", () => {
    const scenario = validScenario();
    const stored: ScenarioSeed = {
      ...scenario,
      version: { ...scenario.version, referenceNotes: "Дверь на цепочке." },
      referenceCard: { fields: scenario.referenceCard.fields },
    };

    expect(scenarioForEditing(stored).referenceCard.notes).toBe(
      "Дверь на цепочке.",
    );
  });

  it("keeps a note the reference card already has", () => {
    expect(scenarioForEditing(validScenario()).referenceCard.notes).toBe(
      "Проверить классификацию происшествия.",
    );
  });
});

describe("mergeScenarioAssistantDraft", () => {
  const assistantDraft = () => {
    const { location: _location, ...draft } = validScenario();

    return {
      ...draft,
      code: "S-AI-1A2B3C4D",
      persona: { ...draft.persona, code: "s-ai-1a2b3c4d-caller" },
    };
  };

  it("takes the assistant's codes for a new scenario", () => {
    const merged = mergeScenarioAssistantDraft(
      createEmptyScenario(),
      assistantDraft(),
    );

    expect(merged.code).toBe("S-AI-1A2B3C4D");
    expect(merged.persona.code).toBe("s-ai-1a2b3c4d-caller");
  });

  it("keeps the codes of a published scenario that is being edited", () => {
    const published = validScenario();
    const merged = mergeScenarioAssistantDraft(published, assistantDraft(), {
      keepIdentity: true,
    });

    expect(merged.code).toBe("S-FIRE-TEST");
    expect(merged.persona.code).toBe("s-fire-test-caller");
    expect(merged.location).toEqual(published.location);
  });
});
