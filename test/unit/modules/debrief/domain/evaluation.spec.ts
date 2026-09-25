import {
  evaluateCall,
  matchesReference,
  type EvaluationInput,
  type ReferenceField,
} from "@/modules/debrief/domain/evaluation";

const reference = (
  overrides: Partial<ReferenceField> = {},
): ReferenceField => ({
  field: "street",
  expectedValue: "Учебная",
  acceptableValues: ["улица Учебная"],
  comparison: "normalized",
  isRequired: true,
  ...overrides,
});

const input = (overrides: Partial<EvaluationInput> = {}): EvaluationInput => ({
  questions: [
    {
      text: "Точный адрес",
      isCritical: true,
      satisfied: true,
      obtainedFactKeys: ["address_street"],
      expectedFactKeys: ["address_street"],
    },
    {
      text: "Где находится заявитель",
      isCritical: false,
      satisfied: false,
      obtainedFactKeys: [],
      expectedFactKeys: ["caller_position"],
    },
  ],
  reference: [reference()],
  cardValues: { street: "улица Учебная" },
  expectedServices: ["fire"],
  dispatchedServices: ["fire"],
  answerSeconds: 12,
  answerNormSeconds: 240,
  forbiddenPhrases: 0,
  passThreshold: 75,
  ...overrides,
});

describe("matchesReference", () => {
  it("ignores case, punctuation and the ё distinction", () => {
    expect(matchesReference("  Улица Учебная! ", reference())).toBe(true);
  });

  it("compares a number by its value, not by its spelling", () => {
    const field = reference({
      field: "children_count",
      expectedValue: "2",
      acceptableValues: ["двое"],
      comparison: "numeric_range",
    });

    expect(matchesReference("2", field)).toBe(true);
    expect(matchesReference("3", field)).toBe(false);
  });

  it("finds the street inside the one line the operator typed", () => {
    const field = reference({ comparison: "contains" });

    expect(
      matchesReference("улица Учебная, дом 12, подъезд 2", field),
    ).toBe(true);
  });

  it("counts an empty field as not filled rather than as wrong", () => {
    expect(matchesReference(null, reference())).toBe(false);
    expect(matchesReference("   ", reference())).toBe(false);
  });

  it("holds an exact comparison to the exact string", () => {
    const field = reference({ comparison: "exact", expectedValue: "fire" });

    expect(matchesReference("fire", field)).toBe(true);
    expect(matchesReference("Fire", field)).toBe(false);
  });
});

describe("evaluateCall", () => {
  it("weighs a critical question twice", () => {
    const evaluation = evaluateCall(input());
    const questioning = evaluation.skills.find(
      (skill) => skill.key === "questioning",
    );

    // Критический закрыт, обычный нет: 2 из 3, а не 1 из 2.
    expect(questioning?.percent).toBe(67);
    expect(questioning?.detail).toBe("1 из 2 обязательных вопросов");
  });

  it("passes a call that clears the threshold of the scenario", () => {
    const evaluation = evaluateCall(input());

    expect(evaluation.score).toBe(88);
    expect(evaluation.verdict).toBe("passed");
  });

  it("calls a spotless call excellent", () => {
    const evaluation = evaluateCall(
      input({
        questions: [
          {
            text: "Точный адрес",
            isCritical: true,
            satisfied: true,
            obtainedFactKeys: ["address_street"],
            expectedFactKeys: ["address_street"],
          },
        ],
      }),
    );

    expect(evaluation.score).toBe(100);
    expect(evaluation.verdict).toBe("excellent");
    expect(evaluation.recommendations).toEqual([
      "Разбор не нашёл, к чему придраться: вызов обслужен по регламенту.",
    ]);
  });

  it("fails a call that missed the critical question and the service", () => {
    const evaluation = evaluateCall(
      input({
        questions: [
          {
            text: "Есть ли люди в помещении",
            isCritical: true,
            satisfied: false,
            obtainedFactKeys: [],
            expectedFactKeys: ["trapped_children"],
          },
        ],
        dispatchedServices: [],
        cardValues: { street: null },
      }),
    );

    expect(evaluation.verdict).toBe("failed");
    expect(evaluation.recommendations[0]).toBe(
      "Обязательный вопрос остался незакрытым: Есть ли люди в помещении.",
    );
    expect(evaluation.recommendations).toContain(
      "Не назначены службы, которых требует происшествие: fire.",
    );
  });

  it("takes points off for a service nobody needed", () => {
    const evaluation = evaluateCall(
      input({ dispatchedServices: ["fire", "gas"] }),
    );
    const services = evaluation.skills.find(
      (skill) => skill.key === "services",
    );

    expect(services?.percent).toBe(75);
    expect(services?.detail).toBe("1 из 1 нужных служб, лишних 1");
  });

  it("notices the norm and the forbidden phrases separately", () => {
    const evaluation = evaluateCall(
      input({ answerSeconds: 300, forbiddenPhrases: 2 }),
    );
    const regulations = evaluation.skills.find(
      (skill) => skill.key === "regulations",
    );

    expect(regulations?.percent).toBe(0);
    expect(regulations?.detail).toBe(
      "норматив приёма превышен, запрещённых фраз: 2",
    );
  });

  it("reports at most four recommendations", () => {
    const evaluation = evaluateCall(
      input({
        questions: Array.from({ length: 6 }, (_, index) => ({
          text: `Вопрос ${index + 1}`,
          isCritical: true,
          satisfied: false,
          obtainedFactKeys: [],
          expectedFactKeys: [],
        })),
      }),
    );

    expect(evaluation.recommendations).toHaveLength(4);
  });
});
