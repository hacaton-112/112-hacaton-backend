import { parseGrammarConfig } from "@/modules/grammar/infrastructure/grammar.config";

describe("parseGrammarConfig", () => {
  it("keeps the model review off until it is asked for", () => {
    expect(parseGrammarConfig({})).toEqual({ modelReviewEnabled: false });
  });

  it("turns the model review on", () => {
    expect(
      parseGrammarConfig({ GRAMMAR_MODEL_REVIEW_ENABLED: "true" }),
    ).toEqual({ modelReviewEnabled: true });
  });

  it("refuses a value it cannot read", () => {
    // Иначе опечатка в docker compose тихо оставила бы проверку выключенной.
    expect(() =>
      parseGrammarConfig({ GRAMMAR_MODEL_REVIEW_ENABLED: "1" }),
    ).toThrow();
  });
});
