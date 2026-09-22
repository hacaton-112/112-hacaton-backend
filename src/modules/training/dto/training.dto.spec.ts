import { CreateTrainingAssignmentSchema } from "./training.dto";

const assignment = {
  title: "Смена ДДС: действия с карточкой",
  scenarioVersionId: "a95237ec-cf7c-4139-a96f-c6201800fd4f",
  groupId: "68e4085a-a84f-435e-804f-8a242db80385",
};

const codes = (input: unknown): string[] => {
  const parsed = CreateTrainingAssignmentSchema.safeParse(input);

  return parsed.success
    ? []
    : parsed.error.issues.map((issue) => issue.path.join("."));
};

describe("CreateTrainingAssignmentSchema", () => {
  it("accepts a card exercise fed by a generated scenario card", () => {
    expect(
      CreateTrainingAssignmentSchema.parse({
        ...assignment,
        type: "card_action",
        cardSource: "generated",
        answerNormSeconds: 30,
      }).cardSource,
    ).toBe("generated");
  });

  it("does not offer tickets for new card assignments without ticket data", () => {
    expect(
      codes({ ...assignment, type: "card_action", cardSource: "ticket" }),
    ).toEqual(["cardSource"]);
  });

  it("refuses a card exercise that waits for an operator call", () => {
    // Раньше отказ приходил только ученику, когда он нажимал запуск.
    expect(
      codes({
        ...assignment,
        type: "card_action",
        cardSource: "operator_call",
      }),
    ).toEqual(["cardSource"]);
  });

  it("refuses a mixed assignment while neither path can start it", () => {
    expect(codes({ ...assignment, type: "mixed" })).toEqual(["type"]);
  });

  it("keeps the voice assignment free to choose its card source", () => {
    expect(
      CreateTrainingAssignmentSchema.parse({
        ...assignment,
        type: "voice_call",
        cardSource: "operator_call",
      }).type,
    ).toBe("voice_call");
  });
});
