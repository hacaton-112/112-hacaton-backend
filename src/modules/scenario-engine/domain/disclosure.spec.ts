import {
  carriesFactContent,
  type DisclosureContext,
  type DisclosureRule,
  DisclosureRuleSchema,
  factsCarriedBy,
  isFactAvailable,
  matchesKeywords,
  normalizeForMatching,
  type ScenarioFact,
  selectAllowedFacts,
} from "./disclosure";

const context = (
  overrides: Partial<DisclosureContext> = {},
): DisclosureContext => ({
  revealedKeys: [],
  operatorText: "",
  callerTurns: 0,
  panicLevel: 3,
  stage: "conversation",
  ...overrides,
});

const fact = (overrides: Partial<ScenarioFact> = {}): ScenarioFact => ({
  key: "address_street",
  displayLabel: "address_street",
  promptValue: "Улица Учебная, дом 12.",
  severity: "normal",
  disclosure: { type: "immediate" },
  contentKeywords: [],
  priority: 0,
  orderIndex: 0,
  ...overrides,
});

describe("normalizeForMatching", () => {
  it("removes case, punctuation and the ё distinction", () => {
    expect(normalizeForMatching("Где ЁЛКА, скажите?!")).toBe(
      "где елка скажите",
    );
  });
});

describe("matchesKeywords", () => {
  it("matches an inflected form through its stem", () => {
    expect(matchesKeywords("Назовите адрес пожалуйста", ["адрес"])).toBe(true);
    expect(matchesKeywords("По какому адресу горит?", ["адрес"])).toBe(true);
    expect(matchesKeywords("На какой улице вы находитесь", ["улиц"])).toBe(
      true,
    );
  });

  it("does not match an unrelated question", () => {
    expect(matchesKeywords("Сколько людей внутри?", ["адрес", "улиц"])).toBe(
      false,
    );
  });

  it("treats empty input as no match", () => {
    expect(matchesKeywords("", ["адрес"])).toBe(false);
    expect(matchesKeywords("адрес", [])).toBe(false);
  });
});

describe("DisclosureRuleSchema", () => {
  it("accepts every supported variant", () => {
    const rules = [
      { type: "immediate" },
      { type: "on_question", keywords: ["адрес"] },
      { type: "after_turns", turns: 3 },
      { type: "below_panic", level: 2 },
      { type: "after_stage", stage: "wrap_up" },
      { type: "never" },
    ];

    for (const rule of rules) {
      expect(DisclosureRuleSchema.safeParse(rule).success).toBe(true);
    }
  });

  it("no longer knows the rule that chained one fact to another", () => {
    // Порядок опроса больше не задаётся данными: снято намеренно, и сценарий с
    // таким условием обязан не загрузиться, а не открыть факт молча.
    expect(
      DisclosureRuleSchema.safeParse({
        type: "after_fact",
        factKeys: ["trapped_children"],
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown variant and a malformed one", () => {
    expect(DisclosureRuleSchema.safeParse({ type: "on_mood" }).success).toBe(
      false,
    );
    expect(
      DisclosureRuleSchema.safeParse({ type: "on_question", keywords: [] })
        .success,
    ).toBe(false);
    expect(
      DisclosureRuleSchema.safeParse({ type: "below_panic", level: 9 }).success,
    ).toBe(false);
  });
});

describe("isFactAvailable", () => {
  it("opens an immediate fact from the first turn", () => {
    expect(
      isFactAvailable(fact({ disclosure: { type: "immediate" } }), context()),
    ).toBe(true);
  });

  it("opens a question fact only when the operator asks", () => {
    const rule: DisclosureRule = { type: "on_question", keywords: ["адрес"] };

    expect(isFactAvailable(fact({ disclosure: rule }), context())).toBe(false);
    expect(
      isFactAvailable(fact({ disclosure: rule }), context({ operatorText: "Какой адрес?" })),
    ).toBe(true);
  });

  it("waits for the caller to speak enough times", () => {
    const rule: DisclosureRule = { type: "after_turns", turns: 3 };

    expect(isFactAvailable(fact({ disclosure: rule }), context({ callerTurns: 2 }))).toBe(false);
    expect(isFactAvailable(fact({ disclosure: rule }), context({ callerTurns: 3 }))).toBe(true);
  });

  it("keeps a fact behind the panic gate until the caller calms down", () => {
    const rule: DisclosureRule = { type: "below_panic", level: 2 };

    expect(isFactAvailable(fact({ disclosure: rule }), context({ panicLevel: 3 }))).toBe(false);
    expect(isFactAvailable(fact({ disclosure: rule }), context({ panicLevel: 2 }))).toBe(true);
  });

  it("opens a stage fact from that stage onwards", () => {
    const rule: DisclosureRule = { type: "after_stage", stage: "wrap_up" };

    expect(isFactAvailable(fact({ disclosure: rule }), context({ stage: "conversation" }))).toBe(
      false,
    );
    expect(isFactAvailable(fact({ disclosure: rule }), context({ stage: "wrap_up" }))).toBe(true);
    expect(isFactAvailable(fact({ disclosure: rule }), context({ stage: "ended" }))).toBe(true);
  });

  it("opens a question fact by the parsed question rather than by words", () => {
    const rule = {
      type: "on_question" as const,
      keywords: ["люди", "внутри"],
    };

    // Оператор спросил «кто дома?» — в словаре автора таких слов нет, но разбор
    // вопроса назвал факт, и этого достаточно.
    expect(
      isFactAvailable(
        fact({ key: "trapped_children", disclosure: rule }),
        context({
          operatorText: "Кто дома?",
          askedFactKeys: ["trapped_children"],
        }),
      ),
    ).toBe(true);

    // И наоборот: слова совпали, но разбор сказал, что спрашивали о другом.
    expect(
      isFactAvailable(
        fact({ key: "trapped_children", disclosure: rule }),
        context({
          operatorText: "Там люди рядом с домом стоят?",
          askedFactKeys: ["caller_position"],
        }),
      ),
    ).toBe(false);
  });

  it("never opens a fact the caller does not know", () => {
    expect(
      isFactAvailable(
        fact({ disclosure: { type: "never" } }),
        context({ operatorText: "Причина пожара?", callerTurns: 20 }),
      ),
    ).toBe(false);
  });
});

describe("selectAllowedFacts", () => {
  const facts: ScenarioFact[] = [
    fact({ key: "incident_type", orderIndex: 0 }),
    fact({ key: "address_street", priority: 5, orderIndex: 1 }),
    fact({ key: "smoke", priority: 1, orderIndex: 2 }),
    fact({
      key: "door_code",
      displayLabel: "door_code",
      disclosure: { type: "below_panic", level: 1 },
      orderIndex: 3,
    }),
  ];

  it("limits new facts to the budget of the turn", () => {
    const allowed = selectAllowedFacts(facts, context(), 1);

    expect(allowed.facts).toHaveLength(1);
    expect(allowed.fresh).toEqual(["address_street"]);
  });

  it("prefers the higher priority when several conditions hold", () => {
    const allowed = selectAllowedFacts(facts, context(), 2);

    expect(allowed.fresh).toEqual(["address_street", "smoke"]);
  });

  it("prefers a direct answer over a higher-priority background fact", () => {
    const allowed = selectAllowedFacts(
      [
        fact({ key: "incident_type", priority: 10, orderIndex: 0 }),
        fact({
          key: "address_street",
          displayLabel: "address_street",
          priority: 1,
          orderIndex: 1,
          disclosure: { type: "on_question", keywords: ["адрес"] },
        }),
      ],
      context({ operatorText: "Назовите адрес" }),
      1,
    );

    expect(allowed.fresh).toEqual(["address_street"]);
  });

  it("always keeps already revealed facts available for repetition", () => {
    // On the upper steps the caller mostly repeats himself; the model may only
    // do that if those facts stay in the allowed set.
    const allowed = selectAllowedFacts(
      facts,
      context({ revealedKeys: ["incident_type"] }),
      0,
    );

    expect(allowed.facts.map((item) => item.key)).toEqual(["incident_type"]);
    expect(allowed.fresh).toEqual([]);
  });

  it("hides a gated fact until panic drops", () => {
    const panicking = selectAllowedFacts(facts, context({ panicLevel: 3 }), 10);
    const calm = selectAllowedFacts(facts, context({ panicLevel: 1 }), 10);

    expect(panicking.fresh).not.toContain("door_code");
    expect(calm.fresh).toContain("door_code");
  });
});

describe("carriesFactContent", () => {
  it("counts a word the caller inflected", () => {
    expect(carriesFactContent("Там двое детей!", ["дет"])).toBe(true);
  });

  it("does not count a keyword buried inside another word", () => {
    // «видеть» contains «дет», and counting it would mark the children as
    // reported by a caller who only said he cannot see anything.
    expect(carriesFactContent("Я ничего не могу видеть", ["дет"])).toBe(false);
  });

  it("ignores case, punctuation and the ё distinction", () => {
    expect(carriesFactContent("ГОРИТ, всё в дыму!", ["горит"])).toBe(true);
    expect(carriesFactContent("Подъезд — всё в дыму!", ["все в дыму"])).toBe(
      true,
    );
  });

  it("matches a phrase of several words", () => {
    expect(
      carriesFactContent("Квартира тридцать четыре", ["тридцать четыр"]),
    ).toBe(true);
    expect(carriesFactContent("Тридцать шесть", ["тридцать четыр"])).toBe(
      false,
    );
  });

  it("counts nothing for a fact without authored words", () => {
    expect(carriesFactContent("Горит квартира", [])).toBe(false);
  });

  it("counts nothing in an empty reply", () => {
    expect(carriesFactContent("   ", ["горит"])).toBe(false);
  });
});

describe("factsCarriedBy", () => {
  const spoken: ScenarioFact[] = [
    fact({ key: "incident_type", contentKeywords: ["горит", "пожар"] }),
    fact({ key: "trapped_children", contentKeywords: ["дет"] }),
    fact({ key: "door_code", contentKeywords: ["домофон"] }),
  ];

  it("returns every fact the reply carries", () => {
    expect(factsCarriedBy("Горит квартира, там дети!", spoken)).toEqual([
      "incident_type",
      "trapped_children",
    ]);
  });

  it("returns nothing when the reply carries none of them", () => {
    expect(factsCarriedBy("Приезжайте скорее!", spoken)).toEqual([]);
  });
});
