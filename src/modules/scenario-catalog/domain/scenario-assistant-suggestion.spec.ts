import {
  buildScenarioSeedFromSuggestion,
  explicitExpectedServicesFromBrief,
  explicitLocationHintsFromBrief,
  ScenarioAssistantSuggestionSchema,
} from "./scenario-assistant-suggestion";
import { validAssistantSuggestion } from "./scenario-assistant-suggestion.fixture";

describe("scenario assistant suggestion", () => {
  it("turns provider output into a complete Scenario Engine seed", () => {
    const seed = buildScenarioSeedFromSuggestion(
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
    expect(seed.location.locatorCenter).not.toEqual(seed.location.exactPoint);
    expect(seed.referenceCard.fields).toHaveLength(3);
  });

  it("rejects a mandatory question that refers to an unknown fact", () => {
    const suggestion = validAssistantSuggestion();
    suggestion.mandatoryQuestions[0].satisfiedByFactKeys = ["missing"];

    expect(() =>
      buildScenarioSeedFromSuggestion("S-AI-BROKEN", suggestion),
    ).toThrow();
  });

  it.each([
    ["openingLine", "Здравствуйте, служба 112, что случилось?"],
    ["fallbackLine", "Пожалуйста, расскажите подробнее, что произошло"],
  ] as const)("rejects an operator phrase in %s", (field, utterance) => {
    const suggestion = validAssistantSuggestion();
    suggestion[field] = utterance;

    expect(ScenarioAssistantSuggestionSchema.safeParse(suggestion).success).toBe(
      false,
    );
  });

  it("preserves the services explicitly listed by the author", () => {
    const suggestion = {
      ...validAssistantSuggestion(),
      expectedServices: ["ambulance", "police", "gas"] as const,
    };
    const brief =
      "Наезд на пешехода во дворе. Службы: скорая, ГИБДД. Тяжёлый факт — возможный перелом.";

    const seed = buildScenarioSeedFromSuggestion(
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
      buildScenarioSeedFromSuggestion(
        "S-AI-FIRE",
        validAssistantSuggestion(),
        "Учебный пожар в мастерской с одним пострадавшим",
      ).version.expectedServices,
    ).toEqual(["fire", "ambulance"]);
  });

  it("keeps an explicit yard and mobile locator radius from the brief", () => {
    const baseSuggestion = validAssistantSuggestion();
    const suggestion = {
      ...baseSuggestion,
      location: {
        ...baseSuggestion.location,
        terrain: "open_field" as const,
        details: "В поле около столба",
        locatorLabel: "Поле около столба",
      },
    };
    const brief = [
      "Наезд на пешехода во дворе",
      "Водитель задел пешехода, тот упал, жалуется на боль в ноге, в сознании.",
      "Локатор — мобильный, круг 300 м.",
      "Службы: скорая, ГИБДД. Тяжёлый факт — возможный перелом.",
    ].join("\n");

    const seed = buildScenarioSeedFromSuggestion(
      "S-AI-YARD",
      suggestion,
      brief,
    );

    expect(explicitLocationHintsFromBrief(brief)).toEqual({
      terrain: "city_block",
      exactAddressDetails: "Во дворе",
      locatorRadiusMeters: 300,
      locatorLabel: "Мобильный локатор: круг 300 м",
    });
    expect(seed.location).toMatchObject({
      terrain: "city_block",
      exactAddress: { details: "Во дворе" },
      locatorRadiusMeters: 300,
      locatorLabel: "Мобильный локатор: круг 300 м",
    });

    const latitudeDistanceMeters =
      Math.abs(seed.location.locatorCenter[0] - seed.location.exactPoint[0]) *
      111_320;
    const longitudeDistanceMeters =
      Math.abs(seed.location.locatorCenter[1] - seed.location.exactPoint[1]) *
      111_320 *
      Math.cos((seed.location.exactPoint[0] * Math.PI) / 180);

    expect(
      Math.hypot(latitudeDistanceMeters, longitudeDistanceMeters),
    ).toBeLessThan(seed.location.locatorRadiusMeters);
  });

  it("keeps the assistant location defaults when the brief has no hints", () => {
    const seed = buildScenarioSeedFromSuggestion(
      "S-AI-LOCATION",
      validAssistantSuggestion(),
      "Учебное происшествие без явного описания места и способа определения координат",
    );

    expect(seed.location).toMatchObject({
      terrain: "city_block",
      locatorRadiusMeters: 500,
      locatorLabel: "Базовая станция: Учебный квартал",
    });
  });
});
