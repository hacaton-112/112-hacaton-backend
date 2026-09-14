import {
  buildScenarioDraftFromSuggestion,
  explicitExpectedServicesFromBrief,
  ScenarioAssistantSuggestionSchema,
} from "./scenario-assistant-suggestion";
import { validAssistantSuggestion } from "./scenario-assistant-suggestion.fixture";

describe("scenario assistant suggestion", () => {
  it("turns provider output into a complete Scenario Engine seed", () => {
    const seed = buildScenarioDraftFromSuggestion(
      "S-AI-TEST",
      validAssistantSuggestion(),
    );

    expect(
      ScenarioAssistantSuggestionSchema.safeParse(validAssistantSuggestion())
        .success,
    ).toBe(true);
    expect(seed).toMatchObject({
      code: "S-AI-TEST",
      persona: { voiceId: "serena" },
      version: { expectedServices: ["fire", "ambulance"] },
    });
    expect(seed).not.toHaveProperty("location");
    expect(seed.referenceCard.fields).toHaveLength(3);
  });

  it("rejects a mandatory question that refers to an unknown fact", () => {
    const suggestion = validAssistantSuggestion();
    suggestion.mandatoryQuestions[0].satisfiedByFactKeys = ["missing"];

    expect(() =>
      buildScenarioDraftFromSuggestion("S-AI-BROKEN", suggestion),
    ).toThrow();
  });

  it.each([
    ["openingLine", "Здравствуйте, служба 112, что случилось?"],
    ["fallbackLine", "Пожалуйста, расскажите подробнее, что произошло"],
  ] as const)("rejects an operator phrase in %s", (field, utterance) => {
    const suggestion = validAssistantSuggestion();
    suggestion[field] = utterance;

    expect(
      ScenarioAssistantSuggestionSchema.safeParse(suggestion).success,
    ).toBe(false);
  });

  it("preserves the services explicitly listed by the author", () => {
    const suggestion = {
      ...validAssistantSuggestion(),
      expectedServices: ["ambulance", "police", "gas"] as const,
    };
    const brief =
      "Наезд на пешехода во дворе. Службы: скорая, ГИБДД. Тяжёлый факт — возможный перелом.";

    const seed = buildScenarioDraftFromSuggestion(
      "S-AI-ROAD",
      suggestion,
      brief,
    );

    expect(explicitExpectedServicesFromBrief(brief)).toEqual([
      "ambulance",
      "police",
    ]);
    expect(seed.version.expectedServices).toEqual(["ambulance", "police"]);
  });

  it("keeps the assistant services when the author did not list them", () => {
    expect(
      buildScenarioDraftFromSuggestion(
        "S-AI-FIRE",
        validAssistantSuggestion(),
        "Учебный пожар в мастерской с одним пострадавшим",
      ).version.expectedServices,
    ).toEqual(["fire", "ambulance"]);
  });

  it("rejects location data returned outside the model-facing contract", () => {
    expect(
      ScenarioAssistantSuggestionSchema.safeParse({
        ...validAssistantSuggestion(),
        location: {
          city: "Москва",
          exactPoint: { lat: 55.75, lon: 37.61 },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects address fields in generated incident-card facts", () => {
    const suggestion = validAssistantSuggestion() as unknown as {
      facts: { cardField: string }[];
    };
    suggestion.facts[0].cardField = "street";

    expect(
      ScenarioAssistantSuggestionSchema.safeParse(suggestion).success,
    ).toBe(false);
  });
});
