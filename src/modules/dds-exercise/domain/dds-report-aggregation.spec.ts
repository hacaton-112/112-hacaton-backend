import {
  buildDdsReportTiming,
  detectDdsProcessErrors,
  summarizeDdsLessonReport,
} from "./dds-report-aggregation";

describe("DDS lesson report aggregation", () => {
  it("calculates reaction and completion norms", () => {
    expect(
      buildDdsReportTiming({
        createdAt: new Date("2026-09-22T10:00:00Z"),
        acceptedAt: new Date("2026-09-22T10:00:20Z"),
        completedAt: new Date("2026-09-22T10:11:00Z"),
        reactionNormSeconds: 30,
      }),
    ).toMatchObject({
      reactionSeconds: 20,
      reactionWithinNorm: true,
      completionSeconds: 660,
      completionWithinNorm: false,
    });
  });

  it("groups process errors and outcomes", () => {
    const timing = buildDdsReportTiming({
      createdAt: new Date(0),
      acceptedAt: new Date(10_000),
      completedAt: new Date(20_000),
      reactionNormSeconds: 30,
    });
    const errors = detectDdsProcessErrors({
      terminalStatus: "refused",
      expectedOutcome: "accept",
      timing,
    });
    expect(errors).toEqual(["unexpected_refusal"]);
    expect(
      summarizeDdsLessonReport([
        { score: 80, timing, processErrors: errors, finalStatus: "completed" },
        { score: 60, timing, processErrors: errors, finalStatus: "completed" },
      ]),
    ).toMatchObject({
      averageScore: 70,
      minScore: 60,
      maxScore: 80,
      withinNormPercent: 100,
    });
  });

  it("marks a late or unfinished card and a missed refusal", () => {
    const late = buildDdsReportTiming({
      createdAt: new Date(0),
      acceptedAt: new Date(45_000),
      completedAt: new Date(120_000),
      reactionNormSeconds: 30,
    });
    expect(
      detectDdsProcessErrors({
        terminalStatus: "completed",
        expectedOutcome: "refuse",
        timing: late,
      }),
    ).toEqual(["late_acknowledgement", "missed_refusal"]);

    const untouched = buildDdsReportTiming({
      createdAt: new Date(0),
      acceptedAt: null,
      completedAt: null,
      reactionNormSeconds: 30,
    });
    expect(
      detectDdsProcessErrors({
        terminalStatus: "lesson_finished",
        expectedOutcome: null,
        timing: untouched,
      }),
    ).toEqual(["late_acknowledgement", "unfinished"]);
  });

  it("does not blame a card without a reference outcome", () => {
    const timing = buildDdsReportTiming({
      createdAt: new Date(0),
      acceptedAt: new Date(10_000),
      completedAt: new Date(20_000),
      reactionNormSeconds: 30,
    });
    expect(
      detectDdsProcessErrors({
        terminalStatus: "refused",
        expectedOutcome: null,
        timing,
      }),
    ).toEqual([]);
  });

  it("counts a card within the group norm only when both timings fit", () => {
    const timing = buildDdsReportTiming({
      createdAt: new Date(0),
      acceptedAt: new Date(10_000),
      completedAt: new Date(700_000),
      reactionNormSeconds: 30,
    });
    expect(
      summarizeDdsLessonReport([
        { score: 80, timing, processErrors: [], finalStatus: "completed" },
      ]).withinNormPercent,
    ).toBe(0);
  });
});
