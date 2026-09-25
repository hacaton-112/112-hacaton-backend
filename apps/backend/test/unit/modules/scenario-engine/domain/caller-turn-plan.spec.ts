import { planCallerTurn, planOpeningDelayMs } from "@/modules/scenario-engine/domain/caller-turn-plan";

const baseInput = {
  rngSeed: "seed-1",
  callerTurns: 1,
  operatorText: "Назовите адрес происшествия.",
  panicLevel: 2 as const,
  tone: "neutral" as const,
  initiative: false,
  freshFactIds: ["address"],
  focusFactIds: ["address"],
};

describe(planCallerTurn.name, () => {
  it("is deterministic for the same persisted call state", () => {
    expect(planCallerTurn(baseInput)).toEqual(planCallerTurn(baseInput));
  });

  it("reacts to the operator before selecting conversational variation", () => {
    expect(planCallerTurn({ ...baseInput, tone: "calming" }).reactionAct).toBe(
      "acknowledge",
    );
    expect(
      planCallerTurn({ ...baseInput, tone: "forbidden" }).reactionAct,
    ).toBe("emotional-reaction");
  });

  it("refuses an overloaded instruction at the highest panic level", () => {
    const plan = planCallerTurn({
      ...baseInput,
      panicLevel: 4,
      operatorText:
        "Сначала отойдите к выходу затем осмотритесь и подробно назовите всё что находится вокруг вас",
    });

    expect(plan.reactionAct).toBe("panic-refusal");
  });

  it("repeats a focused known fact only after an explicit request", () => {
    const plan = planCallerTurn({
      ...baseInput,
      operatorText: "Повторите адрес, пожалуйста.",
      freshFactIds: [],
      focusFactIds: ["address"],
    });

    expect(plan.reactionAct).toBe("repeat");
    expect(plan.focusFactIds).toEqual(["address"]);
  });

  it("asks for clarification instead of retelling known information", () => {
    const plan = planCallerTurn({
      ...baseInput,
      operatorText: "Как зовут пострадавшего?",
      freshFactIds: [],
      focusFactIds: [],
    });

    expect(plan.reactionAct).toBe("clarify");
    expect(plan.focusFactIds).toEqual([]);
  });

  it("acknowledges an instruction without repeating the incident", () => {
    const plan = planCallerTurn({
      ...baseInput,
      operatorText: "Оставайтесь на линии.",
      freshFactIds: [],
      focusFactIds: [],
    });

    expect(plan.reactionAct).toBe("acknowledge");
  });

  it("does not repeat the opening line on caller initiative", () => {
    const plan = planCallerTurn({
      ...baseInput,
      initiative: true,
      operatorText: "",
      freshFactIds: [],
      focusFactIds: ["incident"],
    });

    expect(plan.reactionAct).toBe("emotional-reaction");
    expect(plan.focusFactIds).toEqual([]);
  });

  it("keeps all conversational pauses short and bounded", () => {
    for (const panicLevel of [0, 1, 2, 3, 4] as const) {
      const delay = planCallerTurn({
        ...baseInput,
        panicLevel,
      }).minimumResponseDelayMs;

      expect(delay).toBeGreaterThanOrEqual(120);
      expect(delay).toBeLessThanOrEqual(850);
      expect(planOpeningDelayMs("seed-1", panicLevel)).toBeGreaterThanOrEqual(
        140,
      );
    }
  });
});
