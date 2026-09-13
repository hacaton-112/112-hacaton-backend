import {
  buildScenarioSeedFromSuggestion,
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
});
