import { summarizeInstructorDds } from "@/modules/reports/domain/dds-instructor-report-aggregation";

describe(summarizeInstructorDds.name, () => {
  it("summarizes scores, norms, errors, coverage and lesson dynamics", () => {
    const result = summarizeInstructorDds([
      {
        exerciseId: "one",
        operatorId: "user",
        operatorName: "Ученик",
        lessonId: "00000000-0000-4000-8000-000000000001",
        lessonTitle: "Практика",
        occurredAt: "2026-01-01T10:00:00.000Z",
        finalStatus: "completed",
        automaticScore: 80,
        finalScore: 90,
        passThreshold: 75,
        withinNorm: true,
        processErrors: ["late_acknowledgement"],
        coverage: [{ id: "address", label: "Адрес", status: "missing" }],
      },
      {
        exerciseId: "two",
        operatorId: "user",
        operatorName: "Ученик",
        lessonId: "00000000-0000-4000-8000-000000000001",
        lessonTitle: "Практика",
        occurredAt: "2026-01-01T10:05:00.000Z",
        finalStatus: "refused",
        automaticScore: 60,
        finalScore: 60,
        passThreshold: 75,
        withinNorm: false,
        processErrors: ["late_acknowledgement"],
        coverage: [{ id: "address", label: "Адрес", status: "present" }],
      },
    ]);

    expect(result).toMatchObject({
      cards: 2,
      averageScore: 70,
      finalScore: 75,
      withinNormPercent: 50,
      averageCoveragePercent: 50,
    });
    expect(result.topErrors[0]).toEqual({
      type: "late_acknowledgement",
      count: 2,
    });
    expect(result.scoreDynamics[0]?.score).toBe(75);
  });
});
