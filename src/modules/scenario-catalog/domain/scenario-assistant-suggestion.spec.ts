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
      persona: { gender: "female" },
      version: { expectedServices: ["fire", "ambulance"] },
    });
    expect(["serena", "vivian", "sohee", "ono_anna"]).toContain(
      seed.persona.voiceId,
    );
    expect(seed).not.toHaveProperty("location");
    // Факты и обязательные вопросы собирает код: модель их больше не пишет,
    // поэтому и сослаться на несуществующий факт ей негде.
    expect(seed.facts.map((fact) => fact.key)).toEqual([
      "incident_type",
      "victims",
      "caller_name",
      "detail_1",
      "detail_2",
    ]);
    expect(seed.mandatoryQuestions.map((question) => question.text)).toEqual([
      "Есть ли пострадавшие и сколько",
      "Как зовут заявителя",
    ]);
  });

  it("keeps the model answer short", () => {
    // Пара сотен токенов вместо тысячи: на CPU это секунды, а не минута.
    expect(JSON.stringify(validAssistantSuggestion()).length).toBeLessThan(600);
  });

  it("rejects an operator phrase in the opening line", () => {
    const suggestion = validAssistantSuggestion();
    suggestion.openingLine = "Здравствуйте, служба 112, что случилось?";

    expect(
      ScenarioAssistantSuggestionSchema.safeParse(suggestion).success,
    ).toBe(false);
  });

  it("preserves the services explicitly listed by the author", () => {
    const suggestion = {
      ...validAssistantSuggestion(),
      services: ["ambulance", "police", "gas"] as const,
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

  it("rejects an address returned by the model", () => {
    expect(
      ScenarioAssistantSuggestionSchema.safeParse({
        ...validAssistantSuggestion(),
        address: "улица Учебная, дом 1",
      }).success,
    ).toBe(false);
  });
});
