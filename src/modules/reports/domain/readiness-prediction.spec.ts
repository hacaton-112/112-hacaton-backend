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
});
