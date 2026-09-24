import { predictReadiness } from "./readiness-prediction";

const history = (count: number, score = 85) =>
  Array.from({ length: count }, (_, index) => ({
    occurredAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    score: score + (index % 3),
    passed: true,
    withinNorm: true,
    hasProcessErrors: false,
    textCoverage: 0.9,
  }));

describe(predictReadiness.name, () => {
  it("returns insufficient data without pretending quality was measured", () => {
    const result = predictReadiness(history(3));
    expect(result.label).toBe("insufficient");
    expect(result.quality).toMatchObject({
      status: "insufficient",
      observations: 3,
      accuracy: null,
    });
  });

  it("uses the later chronological part for quality measurement", () => {
    const result = predictReadiness(history(10));
    expect(result.label).toBe("ready");
    expect(result.quality.status).toBe("measured");
    expect(result.quality.trainingObservations).toBe(6);
    expect(result.quality.testObservations).toBe(4);
    expect(result.quality.accuracy).toBe(1);
  });

  it("is reproducible for the same observations", () => {
    const observations = history(8, 62);
    expect(predictReadiness(observations)).toEqual(
      predictReadiness([...observations].reverse()),
    );
  });

  it("does not let a checked attempt see its own result", () => {
    // Шесть провалов подряд, затем два успеха. Если прогноз для проверяемой
    // попытки считать вместе с ней самой, он увидит её высокий балл и «угадает»
    // оба успеха. По одной лишь прошлой истории он их предсказать не может.
    const failing = Array.from({ length: 6 }, (_, index) => ({
      occurredAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      score: 35,
      passed: false,
      withinNorm: false,
      hasProcessErrors: true,
      textCoverage: 0.3,
    }));
    const passing = Array.from({ length: 2 }, (_, index) => ({
      occurredAt: new Date(Date.UTC(2026, 0, index + 7)).toISOString(),
      score: 98,
      passed: true,
      withinNorm: true,
      hasProcessErrors: false,
      textCoverage: 1,
    }));

    const quality = predictReadiness([...failing, ...passing]).quality;

    expect(quality.status).toBe("measured");
    expect(quality.accuracy).toBeLessThan(1);
  });

  it("names nothing as a blocker when nothing holds the trainee back", () => {
    expect(predictReadiness(history(10, 95)).blockers).toEqual([]);
  });
});
