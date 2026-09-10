import { planCallerTurn, planOpeningDelayMs } from "./caller-turn-plan";

const baseInput = {
  rngSeed: "seed-1",
  callerTurns: 1,
  operatorText: "Назовите адрес происшествия.",
  panicLevel: 2 as const,
  tone: "neutral" as const,
  initiative: false,
  freshFactIds: ["address"],
  allowedFactIds: ["incident", "address"],
  recentTurns: [{ role: "caller" as const, text: "Горит квартира!" }],
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

  it("repeats known information instead of inventing a new fact", () => {
    const plan = planCallerTurn({
      ...baseInput,
      freshFactIds: [],
      allowedFactIds: ["incident"],
    });

    expect(plan.reactionAct).toBe("repeat");
  });

  it("asks for clarification when the scenario permits no answer", () => {
    const plan = planCallerTurn({
      ...baseInput,
      freshFactIds: [],
      allowedFactIds: [],
    });

    expect(plan.reactionAct).toBe("clarify");
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
