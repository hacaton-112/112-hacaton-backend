import {
  clampPanicLevel,
  deliveryExamples,
  panicProfile,
  PANIC_LEVELS,
  type EscalationRule,
  type PanicLevel,
  resolveEscalation,
  resolveVoice,
} from "./panic-scale";

const NOW = new Date("2026-09-08T10:00:00.000Z");

const rules: EscalationRule[] = [
  { trigger: "operator_silence", direction: "up", cooldownSeconds: 10 },
  { trigger: "heavy_fact_revealed", direction: "up", cooldownSeconds: 0 },
  { trigger: "calming_phrase", direction: "down", cooldownSeconds: 15 },
];

const secondsAgo = (seconds: number): Date =>
  new Date(NOW.getTime() - seconds * 1_000);

describe("panic profiles", () => {
  it("tightens the fact budget as the caller loses control", () => {
    const budgets = PANIC_LEVELS.map((level) => panicProfile(level).factBudget);

    expect(budgets).toEqual([3, 3, 2, 1, 1]);
  });

  it("allows interruptions only from the third step", () => {
    const allowed = PANIC_LEVELS.map(
      (level) => panicProfile(level).allowsInterruption,
    );

    expect(allowed).toEqual([false, false, false, true, true]);
  });

  it("shortens the silence a caller tolerates as panic grows", () => {
    expect(panicProfile(0).initiativeSilenceSeconds).toBeNull();
    expect(panicProfile(2).initiativeSilenceSeconds).toBe(6);
    expect(panicProfile(4).initiativeSilenceSeconds).toBe(3);
  });

  it("describes the state in words the prompt can use", () => {
    for (const level of PANIC_LEVELS) {
      expect(panicProfile(level).description.length).toBeGreaterThan(10);
    }
  });
});

describe("resolveVoice", () => {
  it("raises intensity and pace with the step", () => {
    const calm = resolveVoice(0, 1);
    const panicking = resolveVoice(4, 1);

    expect(calm.emotion).toBe("calm");
    expect(panicking.emotion).toBe("panic");
    expect(panicking.intensity).toBeGreaterThan(calm.intensity);
    expect(panicking.speechRate).toBeGreaterThan(calm.speechRate);
  });

  it("keeps the pace inside the contract range for a fast persona", () => {
    // 1.9 × 1.3 would leave the 0.5–2 window SpeechRateSchema accepts.
    expect(resolveVoice(4, 1.9).speechRate).toBeLessThanOrEqual(2);
    expect(resolveVoice(0, 0.4).speechRate).toBeGreaterThanOrEqual(0.5);
  });
});

describe("clampPanicLevel", () => {
  it("keeps the level inside the scenario bounds", () => {
    expect(clampPanicLevel(4, 0, 2)).toBe(2);
    expect(clampPanicLevel(0, 2, 4)).toBe(2);
    expect(clampPanicLevel(3, 0, 4)).toBe(3);
  });
});

describe("resolveEscalation", () => {
  const base = {
    rules,
    currentLevel: 2 as PanicLevel,
    floor: 0 as PanicLevel,
    ceiling: 4 as PanicLevel,
    changedAt: null,
    now: NOW,
  };

  it("moves one step up for a firing trigger", () => {
    expect(
      resolveEscalation({ ...base, firedTriggers: ["operator_silence"] }),
    ).toEqual({
      level: 3,
      trigger: "operator_silence",
      direction: "up",
    });
  });

  it("moves one step down for a calming phrase", () => {
    expect(
      resolveEscalation({ ...base, firedTriggers: ["calming_phrase"] }),
    ).toEqual({
      level: 1,
      trigger: "calming_phrase",
      direction: "down",
    });
  });

  it("applies a single rule even when several triggers fire at once", () => {
    const transition = resolveEscalation({
      ...base,
      firedTriggers: ["operator_silence", "heavy_fact_revealed"],
    });

    // Two steps in one turn would make the voice jump and the debrief unreadable.
    expect(transition?.level).toBe(3);
  });

  it("ignores a trigger the scenario has no rule for", () => {
    expect(
      resolveEscalation({ ...base, firedTriggers: ["forbidden_phrase"] }),
    ).toBeNull();
  });

  it("waits out the cooldown of the rule", () => {
    const tooSoon = resolveEscalation({
      ...base,
      firedTriggers: ["operator_silence"],
      changedAt: secondsAgo(4),
    });
    const lateEnough = resolveEscalation({
      ...base,
      firedTriggers: ["operator_silence"],
      changedAt: secondsAgo(11),
    });

    expect(tooSoon).toBeNull();
    expect(lateEnough?.level).toBe(3);
  });

  it("fires immediately for a rule without a cooldown", () => {
    expect(
      resolveEscalation({
        ...base,
        firedTriggers: ["heavy_fact_revealed"],
        changedAt: secondsAgo(1),
      })?.level,
    ).toBe(3);
  });

  it("stays inside the scenario bounds", () => {
    expect(
      resolveEscalation({
        ...base,
        currentLevel: 4,
        firedTriggers: ["operator_silence"],
      }),
    ).toBeNull();

    expect(
      resolveEscalation({
        ...base,
        currentLevel: 2,
        floor: 2,
        firedTriggers: ["calming_phrase"],
      }),
    ).toBeNull();
  });
});

describe("panic profiles as the prompt sees them", () => {
  it("says how the caller speaks, not only how he feels", () => {
    // «В панике» модель отыгрывает ровной фразой с точкой; отличает ступени на
    // слух именно длина реплики, повторы и право строить связный рассказ.
    for (const level of PANIC_LEVELS) {
      const profile = panicProfile(level);

      expect(profile.speechRules.length).toBeGreaterThan(20);
      expect(profile.examples.length).toBeGreaterThan(1);
    }
  });

  it("lets the calm caller build a story and the panicking one only shout", () => {
    expect(panicProfile(0).speechRules).toContain("полными фразами");
    expect(panicProfile(4).speechRules).toContain("обрывками");
  });

  it("never tells the caller to repeat what was already said", () => {
    // Правило «повторяет ключевые слова» модель исполняла буквально: один и
    // тот же факт звучал хвостом каждой реплики.
    for (const level of PANIC_LEVELS) {
      expect(panicProfile(level).speechRules).not.toMatch(/повторяет/u);
    }
  });

  it("keeps the delivery examples free of anything a scenario could hold", () => {
    // Профиль общий для всех сценариев, а пример модель переносит почти
    // дословно: «Дети там, дети!» из пожара звучало в наезде на пешехода.
    const scenarioWords =
      /\d|дет|гор|пожар|дым|этаж|кварт|подъезд|(?<!\p{L})дом(?!\p{L})|улиц|машин|газ|двер|окн|муж|жена|кров/iu;

    for (const level of PANIC_LEVELS) {
      for (const example of panicProfile(level).examples) {
        expect(example).not.toMatch(scenarioWords);
      }
    }
  });

  it("keeps the delivery examples free of gendered past forms", () => {
    // «Я вышел» из примера модель повторяла и за женщину-заявителя.
    // \b в JavaScript не видит границ кириллических слов, поэтому границы
    // заданы явно.
    const gendered = /(?<!\p{L})\p{L}+(?:л|ла|лся|лась)(?!\p{L})/iu;

    for (const level of PANIC_LEVELS) {
      for (const example of panicProfile(level).examples) {
        expect(example).not.toMatch(gendered);
      }
    }
  });
});

describe("deliveryExamples", () => {
  it("offers two different examples of the current step", () => {
    const examples = deliveryExamples(3, "call-1:4");

    expect(examples).toHaveLength(2);
    expect(new Set(examples).size).toBe(2);
    for (const example of examples) {
      expect(panicProfile(3).examples).toContain(example);
    }
  });

  it("gives the same turn the same examples", () => {
    expect(deliveryExamples(4, "call-1:7")).toEqual(
      deliveryExamples(4, "call-1:7"),
    );
  });

  it("does not show the same examples on every turn of a call", () => {
    const shown = new Set(
      Array.from({ length: 12 }, (_, turn) =>
        deliveryExamples(4, `call-1:${turn}`).join("|"),
      ),
    );

    // Иначе модель со временем начинает произносить пример сама.
    expect(shown.size).toBeGreaterThan(1);
  });
});
