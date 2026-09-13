import { describe, expect, it } from "bun:test";

import {
  createEmptyScenario,
  GenerateScenarioDraftResponseSchema,
  ScenarioSeedSchema,
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

describe("ScenarioSeedSchema", () => {
  it("accepts a complete scenario from the constructor", () => {
    expect(ScenarioSeedSchema.parse(validScenario()).code).toBe("S-FIRE-TEST");
  });

  it("rejects cross-references to facts that do not exist", () => {
    const scenario = validScenario();
    scenario.mandatoryQuestions[0].satisfiedByFactKeys = ["missing"];

    expect(ScenarioSeedSchema.safeParse(scenario).success).toBe(false);
  });

  it("validates an assistant response through the same scenario schema", () => {
    expect(
      GenerateScenarioDraftResponseSchema.safeParse({
        scenario: validScenario(),
        authoringPrompt:
          "Сформируй синтетический учебный пожар в мастерской с пострадавшим.",
      }).success,
    ).toBe(true);
  });
});
